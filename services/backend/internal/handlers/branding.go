package handlers

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"image"
	"image/png"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/justlabv1/justspace/backend/internal/middleware"
	"github.com/justlabv1/justspace/backend/internal/models"
	"golang.org/x/image/draw"
)

const maxBrandLogoBytes int64 = 2 * 1024 * 1024
const maxBrandLogoRequestBytes int64 = maxBrandLogoBytes + 128*1024

func (h *AuthHandler) PublicBranding(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	settings, err := h.repo.GetPlatformSettings(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load platform branding")
		return
	}
	writeJSON(w, http.StatusOK, h.brandingResponse(settings))
}

func (h *AuthHandler) PublicBrandLogo(w http.ResponseWriter, r *http.Request) {
	settings, err := h.repo.GetPlatformSettings(r.Context())
	if err != nil || settings.BrandLogoKey == nil || h.fileStore == nil {
		writeError(w, http.StatusNotFound, "brand logo not found")
		return
	}
	size := brandingLogoSize(chi.URLParam(r, "size"))
	path := brandingLogoPath(*settings.BrandLogoKey, size)
	file, err := h.fileStore.Open(path)
	if err != nil {
		writeError(w, http.StatusNotFound, "brand logo not found")
		return
	}
	defer file.Close()
	version := ""
	if settings.BrandLogoUpdatedAt != nil {
		version = settings.BrandLogoUpdatedAt.UTC().Format(time.RFC3339Nano)
	}
	w.Header().Set("Content-Type", "image/png")
	w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	w.Header().Set("ETag", fmt.Sprintf(`"%s-%d-%s"`, *settings.BrandLogoKey, size, version))
	_, _ = io.Copy(w, file)
}

func (h *AuthHandler) AdminBranding(w http.ResponseWriter, r *http.Request) {
	if !h.requirePlatformAdmin(w, r) {
		return
	}
	settings, err := h.repo.GetPlatformSettings(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load platform branding")
		return
	}
	writeJSON(w, http.StatusOK, h.brandingResponse(settings))
}

func (h *AuthHandler) UpdateAdminBranding(w http.ResponseWriter, r *http.Request) {
	if !h.requirePlatformAdmin(w, r) {
		return
	}
	var req struct {
		BrandName string `json:"brandName"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	name := strings.TrimSpace(req.BrandName)
	if name == "" || len([]rune(name)) > 80 {
		writeError(w, http.StatusBadRequest, "brand name must contain between 1 and 80 characters")
		return
	}
	settings, err := h.repo.UpdatePlatformSettings(r.Context(), models.PlatformSettingsUpdateRequest{BrandName: &name})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update platform branding")
		return
	}
	h.recordAdminAudit(r, "branding.name_updated", "platform", "", name, nil)
	writeJSON(w, http.StatusOK, h.brandingResponse(settings))
}

func (h *AuthHandler) UploadBrandLogo(w http.ResponseWriter, r *http.Request) {
	if !h.requirePlatformAdmin(w, r) {
		return
	}
	if h.fileStore == nil {
		writeError(w, http.StatusInternalServerError, "file storage is unavailable")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxBrandLogoRequestBytes)
	if err := r.ParseMultipartForm(maxBrandLogoRequestBytes); err != nil {
		writeError(w, http.StatusBadRequest, "logo must be a PNG image up to 2 MB")
		return
	}
	file, _, err := r.FormFile("logo")
	if err != nil {
		writeError(w, http.StatusBadRequest, "logo file is required")
		return
	}
	defer file.Close()
	data, err := io.ReadAll(file)
	if err != nil {
		writeError(w, http.StatusBadRequest, "failed to read logo")
		return
	}
	if int64(len(data)) > maxBrandLogoBytes {
		writeError(w, http.StatusBadRequest, "logo must be a PNG image up to 2 MB")
		return
	}
	config, err := png.DecodeConfig(bytes.NewReader(data))
	if err != nil || config.Width != config.Height || config.Width < 512 {
		writeError(w, http.StatusBadRequest, "logo must be a square PNG of at least 512x512 pixels")
		return
	}
	source, err := png.Decode(bytes.NewReader(data))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid PNG logo")
		return
	}
	key, err := randomBrandLogoKey()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create logo asset")
		return
	}
	savedPaths := make([]string, 0, 4)
	for _, size := range []int{512, 192, 180, 32} {
		canvas := image.NewRGBA(image.Rect(0, 0, size, size))
		draw.CatmullRom.Scale(canvas, canvas.Bounds(), source, source.Bounds(), draw.Over, nil)
		var encoded bytes.Buffer
		if err := png.Encode(&encoded, canvas); err != nil {
			for _, saved := range savedPaths {
				_ = h.fileStore.Delete(saved)
			}
			writeError(w, http.StatusInternalServerError, "failed to encode logo")
			return
		}
		path := brandingLogoPath(key, size)
		if err := h.fileStore.Save(r.Context(), path, bytes.NewReader(encoded.Bytes())); err != nil {
			for _, saved := range savedPaths {
				_ = h.fileStore.Delete(saved)
			}
			writeError(w, http.StatusInternalServerError, "failed to store logo")
			return
		}
		savedPaths = append(savedPaths, path)
	}
	previous, err := h.repo.GetPlatformSettings(r.Context())
	if err != nil {
		for _, saved := range savedPaths {
			_ = h.fileStore.Delete(saved)
		}
		writeError(w, http.StatusInternalServerError, "failed to load current branding")
		return
	}
	settings, err := h.repo.UpdateBrandLogoKey(r.Context(), &key)
	if err != nil {
		log.Printf("brand logo activation failed: %v", err)
		for _, saved := range savedPaths {
			_ = h.fileStore.Delete(saved)
		}
		writeError(w, http.StatusInternalServerError, "failed to activate logo")
		return
	}
	if previous.BrandLogoKey != nil {
		for _, size := range []int{512, 192, 180, 32} {
			_ = h.fileStore.Delete(brandingLogoPath(*previous.BrandLogoKey, size))
		}
	}
	h.recordAdminAudit(r, "branding.logo_updated", "platform", "", settings.BrandName, nil)
	writeJSON(w, http.StatusOK, h.brandingResponse(settings))
}

func (h *AuthHandler) DeleteBrandLogo(w http.ResponseWriter, r *http.Request) {
	if !h.requirePlatformAdmin(w, r) {
		return
	}
	settings, err := h.repo.GetPlatformSettings(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load current branding")
		return
	}
	if settings.BrandLogoKey == nil {
		writeJSON(w, http.StatusOK, h.brandingResponse(settings))
		return
	}
	oldKey := *settings.BrandLogoKey
	settings, err = h.repo.UpdateBrandLogoKey(r.Context(), nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to remove logo")
		return
	}
	if h.fileStore != nil {
		for _, size := range []int{512, 192, 180, 32} {
			_ = h.fileStore.Delete(brandingLogoPath(oldKey, size))
		}
	}
	h.recordAdminAudit(r, "branding.logo_removed", "platform", "", settings.BrandName, nil)
	writeJSON(w, http.StatusOK, h.brandingResponse(settings))
}

func (h *AuthHandler) brandingResponse(settings *models.PlatformSettings) models.PlatformBranding {
	branding := models.PlatformBranding{Name: settings.BrandName}
	if branding.Name == "" {
		branding.Name = "justspace"
	}
	if settings.BrandLogoKey != nil {
		branding.LogoPath = fmt.Sprintf("/api/platform/branding/logo/512?v=%s", urlQueryVersion(settings.BrandLogoUpdatedAt))
		branding.LogoVersion = urlQueryVersion(settings.BrandLogoUpdatedAt)
	}
	return branding
}

func urlQueryVersion(updatedAt *time.Time) string {
	if updatedAt == nil {
		return "default"
	}
	return strconv.FormatInt(updatedAt.UnixNano(), 10)
}

func brandingLogoPath(key string, size int) string {
	return fmt.Sprintf("branding/%s/logo-%d.png", key, size)
}

func brandingLogoSize(value string) int {
	size, _ := strconv.Atoi(value)
	switch size {
	case 32, 180, 192, 512:
		return size
	default:
		return 512
	}
}

func randomBrandLogoKey() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

func (h *AuthHandler) recordAdminAudit(r *http.Request, action, targetType, targetID, targetLabel string, metadata json.RawMessage) {
	if err := h.repo.CreateAdminAudit(r.Context(), middleware.GetUserID(r), action, targetType, targetID, targetLabel, metadata); err != nil {
		// Admin mutations remain successful if audit storage is temporarily unavailable;
		// the failure is visible in server logs for operations monitoring.
		log.Printf("admin audit write failed: action=%s error=%v", action, err)
	}
}
