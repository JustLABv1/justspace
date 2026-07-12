package handlers

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/justlabv1/justspace/backend/internal/middleware"
	"github.com/justlabv1/justspace/backend/internal/models"
	"github.com/justlabv1/justspace/backend/internal/repository"
	"github.com/justlabv1/justspace/backend/internal/storage"
	"github.com/justlabv1/justspace/backend/internal/websocket"
	"golang.org/x/crypto/bcrypt"
)

type AuthHandler struct {
	repo              *repository.Repo
	jwtSecret         string
	oidcEncryptionKey string
	frontendURL       string
	hub               *websocket.Hub
	fileStore         *storage.FileStore
	authLimiter       *authRateLimiter
}

func NewAuthHandler(repo *repository.Repo, jwtSecret, oidcEncryptionKey, frontendURL string, hub *websocket.Hub, fileStore *storage.FileStore) *AuthHandler {
	return &AuthHandler{repo: repo, jwtSecret: jwtSecret, oidcEncryptionKey: oidcEncryptionKey, frontendURL: strings.TrimRight(strings.Split(frontendURL, ",")[0], "/"), hub: hub, fileStore: fileStore, authLimiter: newAuthRateLimiter()}
}

func (h *AuthHandler) Signup(w http.ResponseWriter, r *http.Request) {
	if !h.authLimiter.allow(r) {
		writeError(w, http.StatusTooManyRequests, "too many authentication attempts")
		return
	}
	var req models.SignupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Email == "" || len(req.Password) < 12 {
		writeError(w, http.StatusBadRequest, "email and a password of at least 12 characters are required")
		return
	}
	req.Email = strings.ToLower(strings.TrimSpace(req.Email))
	existing, err := h.repo.GetUserByEmail(r.Context(), req.Email)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	if existing != nil {
		writeError(w, http.StatusConflict, "user already exists")
		return
	}
	settings, err := h.repo.GetPlatformSettings(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	if !settings.LocalAuthEnabled {
		writeError(w, http.StatusForbidden, "local authentication is disabled")
		return
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	user, err := h.repo.CreateUser(r.Context(), req.Email, req.Name, string(hash))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create user")
		return
	}
	token, err := h.generateToken(user.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to generate token")
		return
	}
	h.setTokenCookie(w, r, token)
	writeJSON(w, http.StatusCreated, models.AuthResponse{User: *user})
}

func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	if !h.authLimiter.allow(r) {
		writeError(w, http.StatusTooManyRequests, "too many authentication attempts")
		return
	}
	var req models.LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	req.Email = strings.ToLower(strings.TrimSpace(req.Email))
	user, err := h.repo.GetUserByEmail(r.Context(), req.Email)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	if user == nil || user.PasswordHash == "" || !user.IsActive {
		writeError(w, http.StatusUnauthorized, "invalid credentials")
		return
	}
	settings, err := h.repo.GetPlatformSettings(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	if !settings.LocalAuthEnabled {
		writeError(w, http.StatusForbidden, "local authentication is disabled")
		return
	}
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		writeError(w, http.StatusUnauthorized, "invalid credentials")
		return
	}
	token, err := h.generateToken(user.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to generate token")
		return
	}
	h.setTokenCookie(w, r, token)
	writeJSON(w, http.StatusOK, models.AuthResponse{User: *user})
}

func (h *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{
		Name: "js_token", Value: "", Path: "/",
		MaxAge: -1, HttpOnly: true, SameSite: http.SameSiteLaxMode,
	})
	writeJSON(w, http.StatusOK, map[string]string{"message": "logged out"})
}

func (h *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	user, err := h.repo.GetUserByID(r.Context(), userID)
	if err != nil || user == nil {
		writeError(w, http.StatusUnauthorized, "user not found")
		return
	}
	writeJSON(w, http.StatusOK, user)
}

func (h *AuthHandler) UpdateProfile(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	var req models.UpdateProfileRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	user, err := h.repo.UpdateUser(r.Context(), userID, req.Name, req.Preferences)
	if err != nil {
		log.Printf("UpdateProfile error: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to update profile")
		return
	}
	writeJSON(w, http.StatusOK, user)
}

func (h *AuthHandler) generateToken(userID string) (string, error) {
	claims := jwt.MapClaims{
		"sub": userID,
		"sv":  h.sessionVersion(context.Background(), userID),
		"iat": time.Now().Unix(),
		"exp": time.Now().Add(7 * 24 * time.Hour).Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(h.jwtSecret))
}

func (h *AuthHandler) sessionVersion(ctx context.Context, userID string) int64 {
	_, version, err := h.repo.GetUserAuthState(ctx, userID)
	if err != nil {
		return 0
	}
	return version
}

func (h *AuthHandler) setTokenCookie(w http.ResponseWriter, r *http.Request, token string) {
	http.SetCookie(w, &http.Cookie{
		Name: "js_token", Value: token, Path: "/",
		MaxAge: 7 * 24 * 60 * 60, HttpOnly: true, Secure: requestIsSecure(r), SameSite: http.SameSiteLaxMode,
	})
}
