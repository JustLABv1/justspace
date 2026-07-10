package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"regexp"
	"strings"

	"github.com/coreos/go-oidc/v3/oidc"
	"github.com/go-chi/chi/v5"
	"github.com/justlabv1/justspace/backend/internal/middleware"
	"github.com/justlabv1/justspace/backend/internal/models"
)

var oidcSlugPattern = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$`)

func (h *AuthHandler) requirePlatformAdmin(w http.ResponseWriter, r *http.Request) bool {
	user, err := h.repo.GetUserByID(r.Context(), middleware.GetUserID(r))
	if err != nil || user == nil || !user.IsPlatformAdmin || !user.IsActive {
		writeError(w, http.StatusForbidden, "platform admin access required")
		return false
	}
	return true
}

func (h *AuthHandler) AdminSettings(w http.ResponseWriter, r *http.Request) {
	if !h.requirePlatformAdmin(w, r) {
		return
	}
	settings, err := h.repo.GetPlatformSettings(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load platform settings")
		return
	}
	providers, err := h.repo.ListOIDCProviders(r.Context(), true)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load oidc providers")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"settings": settings, "oidcProviders": providers})
}

func (h *AuthHandler) UpdateAdminSettings(w http.ResponseWriter, r *http.Request) {
	if !h.requirePlatformAdmin(w, r) {
		return
	}
	var req models.PlatformSettingsUpdateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.LocalAuthEnabled != nil && !*req.LocalAuthEnabled {
		count, err := h.repo.CountEnabledOIDCProviders(r.Context())
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to validate authentication settings")
			return
		}
		if count == 0 {
			writeError(w, http.StatusConflict, "enable at least one oidc provider before disabling local authentication")
			return
		}
	}
	settings, err := h.repo.UpdatePlatformSettings(r.Context(), req)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update platform settings")
		return
	}
	h.recordAdminAudit(r, "authentication.settings_updated", "platform", "", "Authentication settings", nil)
	writeJSON(w, http.StatusOK, settings)
}

func (h *AuthHandler) AdminOverview(w http.ResponseWriter, r *http.Request) {
	if !h.requirePlatformAdmin(w, r) {
		return
	}
	overview, err := h.repo.GetAdminOverview(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load admin overview")
		return
	}
	writeJSON(w, http.StatusOK, overview)
}

func (h *AuthHandler) AdminAudit(w http.ResponseWriter, r *http.Request) {
	if !h.requirePlatformAdmin(w, r) {
		return
	}
	limit, offset := boundedPagination(r)
	events, total, err := h.repo.ListAdminAudit(r.Context(), limit, offset)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load audit log")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"documents": events, "total": total, "limit": limit, "offset": offset})
}

func (h *AuthHandler) AdminUsers(w http.ResponseWriter, r *http.Request) {
	if !h.requirePlatformAdmin(w, r) {
		return
	}
	limit, offset := boundedPagination(r)
	users, total, err := h.repo.ListAdminUsers(r.Context(), r.URL.Query().Get("q"), limit, offset)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load users")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"documents": users, "total": total, "limit": limit, "offset": offset})
}

func (h *AuthHandler) UpdateAdminUser(w http.ResponseWriter, r *http.Request) {
	if !h.requirePlatformAdmin(w, r) {
		return
	}
	var req models.AdminUserUpdateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	user, err := h.repo.UpdateAdminUser(r.Context(), middleware.GetUserID(r), chi.URLParam(r, "userId"), req)
	if err != nil {
		status := http.StatusConflict
		if strings.Contains(err.Error(), "not found") {
			status = http.StatusNotFound
		}
		writeError(w, status, err.Error())
		return
	}
	if h.hub != nil {
		h.hub.DisconnectUser(user.ID)
	}
	h.recordAdminAudit(r, "user.access_updated", "user", user.ID, user.Email, nil)
	writeJSON(w, http.StatusOK, user)
}

func (h *AuthHandler) AdminCreateOIDCProvider(w http.ResponseWriter, r *http.Request) {
	if !h.requirePlatformAdmin(w, r) {
		return
	}
	var req models.OIDCProviderRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if err := validateOIDCProviderRequest(req, true); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	req.Slug = strings.ToLower(strings.TrimSpace(req.Slug))
	req.IssuerURL = strings.TrimRight(strings.TrimSpace(req.IssuerURL), "/")
	if err := h.validateOIDCIssuer(r, req.IssuerURL); err != nil {
		writeError(w, http.StatusBadGateway, "oidc discovery failed")
		return
	}
	secret, err := h.encryptSecret(req.ClientSecret)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to encrypt oidc secret")
		return
	}
	provider, err := h.repo.CreateOIDCProvider(r.Context(), req, secret)
	if err != nil {
		writeError(w, http.StatusConflict, "failed to create oidc provider")
		return
	}
	h.recordAdminAudit(r, "oidc.provider_created", "oidc_provider", provider.ID, provider.Name, nil)
	writeJSON(w, http.StatusCreated, provider)
}

func (h *AuthHandler) AdminUpdateOIDCProvider(w http.ResponseWriter, r *http.Request) {
	if !h.requirePlatformAdmin(w, r) {
		return
	}
	var req models.OIDCProviderRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if err := validateOIDCProviderRequest(req, false); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	req.Slug = strings.ToLower(strings.TrimSpace(req.Slug))
	req.IssuerURL = strings.TrimRight(strings.TrimSpace(req.IssuerURL), "/")
	if err := h.validateOIDCIssuer(r, req.IssuerURL); err != nil {
		writeError(w, http.StatusBadGateway, "oidc discovery failed")
		return
	}
	if req.Enabled != nil && !*req.Enabled {
		settings, settingsErr := h.repo.GetPlatformSettings(r.Context())
		count, countErr := h.repo.CountEnabledOIDCProviders(r.Context())
		if settingsErr != nil || countErr != nil {
			writeError(w, http.StatusInternalServerError, "failed to validate authentication settings")
			return
		}
		if !settings.LocalAuthEnabled && count <= 1 {
			writeError(w, http.StatusConflict, "keep at least one oidc provider enabled while local authentication is disabled")
			return
		}
	}
	var secret *string
	if strings.TrimSpace(req.ClientSecret) != "" {
		encrypted, err := h.encryptSecret(req.ClientSecret)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to encrypt oidc secret")
			return
		}
		secret = &encrypted
	}
	provider, err := h.repo.UpdateOIDCProvider(r.Context(), chi.URLParam(r, "providerId"), req, secret)
	if err != nil {
		writeError(w, http.StatusConflict, "failed to update oidc provider")
		return
	}
	h.recordAdminAudit(r, "oidc.provider_updated", "oidc_provider", provider.ID, provider.Name, nil)
	writeJSON(w, http.StatusOK, provider)
}

func (h *AuthHandler) AdminDeleteOIDCProvider(w http.ResponseWriter, r *http.Request) {
	if !h.requirePlatformAdmin(w, r) {
		return
	}
	provider, providerErr := h.repo.GetOIDCProviderByID(r.Context(), chi.URLParam(r, "providerId"))
	if providerErr != nil || provider == nil {
		writeError(w, http.StatusNotFound, "oidc provider not found")
		return
	}
	if provider.Enabled {
		settings, settingsErr := h.repo.GetPlatformSettings(r.Context())
		count, countErr := h.repo.CountEnabledOIDCProviders(r.Context())
		if settingsErr != nil || countErr != nil {
			writeError(w, http.StatusInternalServerError, "failed to validate authentication settings")
			return
		}
		if !settings.LocalAuthEnabled && count <= 1 {
			writeError(w, http.StatusConflict, "keep at least one oidc provider enabled while local authentication is disabled")
			return
		}
	}
	if err := h.repo.DeleteOIDCProvider(r.Context(), chi.URLParam(r, "providerId")); err != nil {
		writeError(w, http.StatusConflict, err.Error())
		return
	}
	h.recordAdminAudit(r, "oidc.provider_deleted", "oidc_provider", provider.ID, provider.Name, nil)
	w.WriteHeader(http.StatusNoContent)
}

func (h *AuthHandler) validateOIDCIssuer(r *http.Request, issuer string) error {
	parsed, err := url.Parse(issuer)
	if err != nil || parsed.Host == "" || parsed.Scheme == "" {
		return fmt.Errorf("invalid issuer url")
	}
	if parsed.Scheme != "https" && !(parsed.Scheme == "http" && (parsed.Hostname() == "localhost" || parsed.Hostname() == "127.0.0.1" || parsed.Hostname() == "::1")) {
		return fmt.Errorf("issuer url must use https")
	}
	_, err = oidc.NewProvider(r.Context(), strings.TrimRight(issuer, "/"))
	return err
}

func validateOIDCProviderRequest(req models.OIDCProviderRequest, create bool) error {
	req.Slug = strings.ToLower(strings.TrimSpace(req.Slug))
	if !oidcSlugPattern.MatchString(req.Slug) {
		return fmt.Errorf("slug must contain 3-64 lowercase letters, numbers, or hyphens")
	}
	if strings.TrimSpace(req.Name) == "" || len(req.Name) > 128 || strings.TrimSpace(req.ClientID) == "" {
		return fmt.Errorf("name and client id are required")
	}
	if create && strings.TrimSpace(req.ClientSecret) == "" {
		return fmt.Errorf("client secret is required for a new provider")
	}
	return nil
}

func boundedPagination(r *http.Request) (int, int) {
	limit := 50
	if value := r.URL.Query().Get("limit"); value != "" {
		if _, err := fmt.Sscanf(value, "%d", &limit); err != nil {
			limit = 50
		}
	}
	if limit < 1 {
		limit = 1
	}
	if limit > 100 {
		limit = 100
	}
	offset := 0
	if value := r.URL.Query().Get("offset"); value != "" {
		_, _ = fmt.Sscanf(value, "%d", &offset)
	}
	if offset < 0 {
		offset = 0
	}
	return limit, offset
}
