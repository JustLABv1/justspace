package handlers

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
	"github.com/go-chi/chi/v5"
	"github.com/justlabv1/justspace/backend/internal/middleware"
	"github.com/justlabv1/justspace/backend/internal/models"
	"golang.org/x/oauth2"
)

const oidcStateCookie = "js_oidc_state"

type oidcState struct {
	State        string `json:"state"`
	Nonce        string `json:"nonce"`
	CodeVerifier string `json:"codeVerifier"`
	ProviderID   string `json:"providerId"`
	UserID       string `json:"userId,omitempty"`
	Link         bool   `json:"link"`
	ExpiresAt    int64  `json:"expiresAt"`
}

type authConfigResponse struct {
	LocalAuthEnabled bool                  `json:"localAuthEnabled"`
	OIDCProviders    []models.OIDCProvider `json:"oidcProviders"`
}

func (h *AuthHandler) AuthConfig(w http.ResponseWriter, r *http.Request) {
	settings, err := h.repo.GetPlatformSettings(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load authentication settings")
		return
	}
	providers, err := h.repo.ListOIDCProviders(r.Context(), false)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load authentication providers")
		return
	}
	writeJSON(w, http.StatusOK, authConfigResponse{LocalAuthEnabled: settings.LocalAuthEnabled, OIDCProviders: providers})
}

func (h *AuthHandler) OIDCStart(w http.ResponseWriter, r *http.Request) {
	h.oidcStart(w, r, "", false)
}

func (h *AuthHandler) OIDCStartLink(w http.ResponseWriter, r *http.Request) {
	h.oidcStart(w, r, middleware.GetUserID(r), true)
}

func (h *AuthHandler) oidcStart(w http.ResponseWriter, r *http.Request, userID string, link bool) {
	slug := chi.URLParam(r, "provider")
	provider, err := h.repo.GetOIDCProviderBySlug(r.Context(), slug)
	if err != nil || provider == nil || !provider.Enabled {
		writeError(w, http.StatusNotFound, "oidc provider not found")
		return
	}
	if link && userID == "" {
		writeError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	if _, err := oidc.NewProvider(r.Context(), provider.IssuerURL); err != nil {
		writeError(w, http.StatusBadGateway, "oidc provider discovery failed")
		return
	}
	state, err := newOIDCState(provider.ID, userID, link)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to start oidc login")
		return
	}
	if err := h.setOIDCStateCookie(w, r, state); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to start oidc login")
		return
	}
	endpoint, err := oidc.NewProvider(r.Context(), provider.IssuerURL)
	if err != nil {
		writeError(w, http.StatusBadGateway, "oidc provider discovery failed")
		return
	}
	oauthConfig := h.oauthConfig(r, provider, endpoint.Endpoint(), state)
	redirectURL := oauthConfig.AuthCodeURL(state.State,
		oauth2.SetAuthURLParam("nonce", state.Nonce),
		oauth2.SetAuthURLParam("code_challenge", pkceChallenge(state.CodeVerifier)),
		oauth2.SetAuthURLParam("code_challenge_method", "S256"),
	)
	http.Redirect(w, r, redirectURL, http.StatusFound)
}

func (h *AuthHandler) OIDCCallback(w http.ResponseWriter, r *http.Request) {
	state, err := h.readOIDCStateCookie(r)
	if err != nil || state.ExpiresAt < time.Now().Unix() || state.State == "" || state.State != r.URL.Query().Get("state") {
		h.oidcErrorRedirect(w, r, state != nil && state.Link, "invalid or expired oidc state")
		return
	}
	h.clearOIDCStateCookie(w, r)
	if callbackError := r.URL.Query().Get("error"); callbackError != "" {
		h.oidcErrorRedirect(w, r, state.Link, "oidc login was cancelled")
		return
	}
	provider, err := h.repo.GetOIDCProviderBySlug(r.Context(), chi.URLParam(r, "provider"))
	if err != nil || provider == nil || !provider.Enabled || provider.ID != state.ProviderID {
		h.oidcErrorRedirect(w, r, state.Link, "oidc provider is unavailable")
		return
	}
	discovered, err := oidc.NewProvider(r.Context(), provider.IssuerURL)
	if err != nil {
		h.oidcErrorRedirect(w, r, state.Link, "oidc provider discovery failed")
		return
	}
	clientSecret, err := h.decryptSecret(provider.ClientSecret)
	if err != nil {
		h.oidcErrorRedirect(w, r, state.Link, "oidc provider credentials are invalid")
		return
	}
	config := h.oauthConfig(r, provider, discovered.Endpoint(), state)
	config.ClientSecret = clientSecret
	token, err := config.Exchange(r.Context(), r.URL.Query().Get("code"), oauth2.SetAuthURLParam("code_verifier", state.CodeVerifier))
	if err != nil {
		h.oidcErrorRedirect(w, r, state.Link, "oidc token exchange failed")
		return
	}
	rawIDToken, ok := token.Extra("id_token").(string)
	if !ok || rawIDToken == "" {
		h.oidcErrorRedirect(w, r, state.Link, "oidc provider did not return an id token")
		return
	}
	verifier := discovered.Verifier(&oidc.Config{ClientID: provider.ClientID})
	idToken, err := verifier.Verify(r.Context(), rawIDToken)
	if err != nil {
		h.oidcErrorRedirect(w, r, state.Link, "oidc id token validation failed")
		return
	}
	if idToken.Nonce != state.Nonce {
		h.oidcErrorRedirect(w, r, state.Link, "oidc nonce validation failed")
		return
	}
	var claims struct {
		Subject       string `json:"sub"`
		Email         string `json:"email"`
		Name          string `json:"name"`
		PreferredName string `json:"preferred_username"`
		EmailVerified *bool  `json:"email_verified"`
	}
	if err := idToken.Claims(&claims); err != nil || claims.Subject == "" || strings.TrimSpace(claims.Email) == "" {
		h.oidcErrorRedirect(w, r, state.Link, "oidc provider returned incomplete identity data")
		return
	}
	if claims.EmailVerified != nil && !*claims.EmailVerified {
		h.oidcErrorRedirect(w, r, state.Link, "oidc email is not verified")
		return
	}
	email := strings.ToLower(strings.TrimSpace(claims.Email))
	identity, err := h.repo.GetOIDCIdentity(r.Context(), provider.ID, claims.Subject)
	if err != nil {
		h.oidcErrorRedirect(w, r, state.Link, "failed to load oidc identity")
		return
	}
	if state.Link {
		linkUser, linkErr := h.repo.GetUserByID(r.Context(), state.UserID)
		if linkErr != nil || linkUser == nil || !linkUser.IsActive {
			h.oidcErrorRedirect(w, r, true, "the account is no longer active")
			return
		}
		if identity != nil && identity.UserID != state.UserID {
			h.oidcErrorRedirect(w, r, true, "oidc identity is already linked to another account")
			return
		}
		if identity == nil {
			existing, lookupErr := h.repo.GetUserByEmail(r.Context(), email)
			if lookupErr != nil || (existing != nil && existing.ID != state.UserID) {
				h.oidcErrorRedirect(w, r, true, "sign in with the existing account before linking oidc")
				return
			}
			if err := h.repo.CreateOIDCIdentity(r.Context(), state.UserID, provider.ID, claims.Subject); err != nil {
				h.oidcErrorRedirect(w, r, true, "failed to link oidc identity")
				return
			}
		}
		http.Redirect(w, r, h.frontendURL+"/settings?tab=Security&oidc=linked", http.StatusFound)
		return
	}
	var user *models.User
	if identity != nil {
		user, err = h.repo.GetUserByID(r.Context(), identity.UserID)
	} else {
		existing, lookupErr := h.repo.GetUserByEmail(r.Context(), email)
		if lookupErr != nil {
			err = lookupErr
		} else if existing != nil {
			h.oidcErrorRedirect(w, r, false, "sign in with your existing account before linking oidc")
			return
		} else {
			name := strings.TrimSpace(claims.Name)
			if name == "" {
				name = strings.TrimSpace(claims.PreferredName)
			}
			user, err = h.repo.CreateUser(r.Context(), email, name, "")
			if err == nil {
				err = h.repo.CreateOIDCIdentity(r.Context(), user.ID, provider.ID, claims.Subject)
			}
		}
	}
	if err != nil || user == nil || !user.IsActive {
		h.oidcErrorRedirect(w, r, false, "oidc account is unavailable")
		return
	}
	sessionToken, err := h.generateToken(user.ID)
	if err != nil {
		h.oidcErrorRedirect(w, r, false, "failed to create session")
		return
	}
	h.setTokenCookie(w, r, sessionToken)
	http.Redirect(w, r, h.frontendURL+"/?oidc=success", http.StatusFound)
}

func (h *AuthHandler) ListOIDCIdentities(w http.ResponseWriter, r *http.Request) {
	identities, err := h.repo.ListOIDCIdentities(r.Context(), middleware.GetUserID(r))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load linked identities")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"documents": identities, "total": len(identities)})
}

func (h *AuthHandler) DeleteOIDCIdentity(w http.ResponseWriter, r *http.Request) {
	if err := h.repo.DeleteOIDCIdentity(r.Context(), middleware.GetUserID(r), chi.URLParam(r, "identityId")); err != nil {
		writeError(w, http.StatusConflict, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func newOIDCState(providerID, userID string, link bool) (*oidcState, error) {
	state, err := randomURLValue(32)
	if err != nil {
		return nil, err
	}
	nonce, err := randomURLValue(32)
	if err != nil {
		return nil, err
	}
	verifier, err := randomURLValue(48)
	if err != nil {
		return nil, err
	}
	return &oidcState{State: state, Nonce: nonce, CodeVerifier: verifier, ProviderID: providerID, UserID: userID, Link: link, ExpiresAt: time.Now().Add(10 * time.Minute).Unix()}, nil
}

func randomURLValue(size int) (string, error) {
	b := make([]byte, size)
	if _, err := io.ReadFull(rand.Reader, b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

func pkceChallenge(verifier string) string {
	sum := sha256.Sum256([]byte(verifier))
	return base64.RawURLEncoding.EncodeToString(sum[:])
}

func (h *AuthHandler) oauthConfig(r *http.Request, provider *models.OIDCProvider, endpoint oauth2.Endpoint, state *oidcState) *oauth2.Config {
	return &oauth2.Config{ClientID: provider.ClientID, ClientSecret: "", Endpoint: endpoint, RedirectURL: h.callbackURL(r, provider.Slug), Scopes: []string{oidc.ScopeOpenID, "email", "profile"}}
}

func (h *AuthHandler) callbackURL(r *http.Request, slug string) string {
	scheme := "https"
	if r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https" {
		scheme = "https"
	} else {
		scheme = "http"
	}
	return fmt.Sprintf("%s://%s/api/auth/oidc/%s/callback", scheme, r.Host, url.PathEscape(slug))
}

func (h *AuthHandler) encryptionKey() []byte {
	key := h.oidcEncryptionKey
	if key == "" {
		return nil
	}
	sum := sha256.Sum256([]byte(key))
	return sum[:]
}

func (h *AuthHandler) cipher() (cipher.AEAD, error) {
	if len(h.encryptionKey()) == 0 {
		return nil, fmt.Errorf("OIDC_ENCRYPTION_KEY is not configured")
	}
	block, err := aes.NewCipher(h.encryptionKey())
	if err != nil {
		return nil, err
	}
	return cipher.NewGCM(block)
}

func (h *AuthHandler) encryptSecret(value string) (string, error) {
	aead, err := h.cipher()
	if err != nil {
		return "", err
	}
	nonce := make([]byte, aead.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}
	return base64.RawStdEncoding.EncodeToString(aead.Seal(nonce, nonce, []byte(value), nil)), nil
}

func (h *AuthHandler) decryptSecret(value string) (string, error) {
	if value == "" {
		return "", nil
	}
	aead, err := h.cipher()
	if err != nil {
		return "", err
	}
	data, err := base64.RawStdEncoding.DecodeString(value)
	if err != nil || len(data) < aead.NonceSize() {
		return "", fmt.Errorf("invalid encrypted oidc secret")
	}
	nonce, ciphertext := data[:aead.NonceSize()], data[aead.NonceSize():]
	plaintext, err := aead.Open(nil, nonce, ciphertext, nil)
	return string(plaintext), err
}

func (h *AuthHandler) setOIDCStateCookie(w http.ResponseWriter, r *http.Request, state *oidcState) error {
	payload, err := json.Marshal(state)
	if err != nil {
		return err
	}
	aead, err := h.cipher()
	if err != nil {
		return err
	}
	nonce := make([]byte, aead.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return err
	}
	value := base64.RawStdEncoding.EncodeToString(aead.Seal(nonce, nonce, payload, nil))
	http.SetCookie(w, &http.Cookie{Name: oidcStateCookie, Value: value, Path: "/", MaxAge: 600, HttpOnly: true, Secure: requestIsSecure(r), SameSite: http.SameSiteLaxMode})
	return nil
}

func (h *AuthHandler) readOIDCStateCookie(r *http.Request) (*oidcState, error) {
	cookie, err := r.Cookie(oidcStateCookie)
	if err != nil {
		return nil, err
	}
	aead, err := h.cipher()
	if err != nil {
		return nil, err
	}
	data, err := base64.RawStdEncoding.DecodeString(cookie.Value)
	if err != nil || len(data) < aead.NonceSize() {
		return nil, fmt.Errorf("invalid state cookie")
	}
	payload, err := aead.Open(nil, data[:aead.NonceSize()], data[aead.NonceSize():], nil)
	if err != nil {
		return nil, err
	}
	var state oidcState
	if err := json.Unmarshal(payload, &state); err != nil {
		return nil, err
	}
	return &state, nil
}

func (h *AuthHandler) clearOIDCStateCookie(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{Name: oidcStateCookie, Value: "", Path: "/", MaxAge: -1, HttpOnly: true, Secure: requestIsSecure(r), SameSite: http.SameSiteLaxMode})
}

func requestIsSecure(r *http.Request) bool {
	return r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https"
}

func (h *AuthHandler) oidcErrorRedirect(w http.ResponseWriter, r *http.Request, link bool, message string) {
	path := "/login"
	if link {
		path = "/settings?tab=Security"
	}
	separator := "?"
	if strings.Contains(path, "?") {
		separator = "&"
	}
	http.Redirect(w, r, h.frontendURL+path+separator+"oidcError="+url.QueryEscape(message), http.StatusFound)
}
