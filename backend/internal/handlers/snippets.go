package handlers

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/justlabv1/justspace/backend/internal/middleware"
	"github.com/justlabv1/justspace/backend/internal/models"
	"github.com/justlabv1/justspace/backend/internal/repository"
	"github.com/justlabv1/justspace/backend/internal/websocket"
)

type SnippetHandler struct {
	repo *repository.Repo
	hub  *websocket.Hub
}

func NewSnippetHandler(repo *repository.Repo, hub *websocket.Hub) *SnippetHandler {
	return &SnippetHandler{repo: repo, hub: hub}
}

func (h *SnippetHandler) List(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	snippets, err := h.repo.ListSnippets(r.Context(), userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list snippets")
		return
	}
	writeJSON(w, http.StatusOK, models.ListResponse[models.Snippet]{Total: len(snippets), Documents: snippets})
}

func (h *SnippetHandler) Create(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	var req models.CreateSnippetRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	snippet, err := h.repo.CreateSnippet(r.Context(), userID, req)
	if err != nil {
		log.Printf("CreateSnippet error: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to create snippet")
		return
	}
	h.repo.LogActivity(r.Context(), userID, "create", "Snippet", snippet.Title, &snippet.ID, nil)
	h.hub.Broadcast(userID, models.WSEvent{Type: "create", Collection: "snippets", Document: snippet, UserID: userID})
	writeJSON(w, http.StatusCreated, snippet)
}

func (h *SnippetHandler) Update(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	id := chi.URLParam(r, "id")
	var req models.UpdateSnippetRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	snippet, err := h.repo.UpdateSnippet(r.Context(), id, userID, req)
	if err != nil {
		log.Printf("UpdateSnippet error: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to update snippet")
		return
	}
	if req.Title != nil || req.IsEncrypted != nil {
		h.repo.LogActivity(r.Context(), userID, "update", "Snippet", snippet.Title, &snippet.ID, nil)
	}
	h.hub.Broadcast(userID, models.WSEvent{Type: "update", Collection: "snippets", Document: snippet, UserID: userID})
	writeJSON(w, http.StatusOK, snippet)
}

func (h *SnippetHandler) Delete(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	id := chi.URLParam(r, "id")
	if err := h.repo.DeleteSnippet(r.Context(), id, userID); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to delete snippet")
		return
	}
	h.repo.LogActivity(r.Context(), userID, "delete", "Snippet", "Snippet", nil, nil)
	h.hub.Broadcast(userID, models.WSEvent{Type: "delete", Collection: "snippets", Document: map[string]string{"id": id}, UserID: userID})
	writeJSON(w, http.StatusOK, map[string]string{"message": "deleted"})
}

// ---- Activity ----
type ActivityHandler struct{ repo *repository.Repo }

func NewActivityHandler(repo *repository.Repo) *ActivityHandler {
	return &ActivityHandler{repo: repo}
}

func (h *ActivityHandler) List(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	activity, err := h.repo.ListActivity(r.Context(), userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list activity")
		return
	}
	writeJSON(w, http.StatusOK, models.ListResponse[models.ActivityLog]{Total: len(activity), Documents: activity})
}

// ---- Vault ----
type VaultHandler struct{ repo *repository.Repo }

func NewVaultHandler(repo *repository.Repo) *VaultHandler {
	return &VaultHandler{repo: repo}
}

func (h *VaultHandler) GetKeys(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	keys, err := h.repo.GetUserKeys(r.Context(), userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to get keys")
		return
	}
	if keys == nil {
		writeJSON(w, http.StatusOK, nil)
		return
	}
	writeJSON(w, http.StatusOK, keys)
}

func (h *VaultHandler) CreateKeys(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	user, err := h.repo.GetUserByID(r.Context(), userID)
	if err != nil || user == nil {
		writeError(w, http.StatusInternalServerError, "failed to get user")
		return
	}
	var req models.CreateUserKeysRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	keys, err := h.repo.CreateUserKeys(r.Context(), userID, user.Email, req)
	if err != nil {
		log.Printf("CreateUserKeys error: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to create keys")
		return
	}
	writeJSON(w, http.StatusCreated, keys)
}

func (h *VaultHandler) UpdateKeys(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	id := chi.URLParam(r, "id")
	var req models.UpdateUserKeysRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	keys, err := h.repo.UpdateUserKeys(r.Context(), id, userID, req)
	if err != nil {
		log.Printf("UpdateUserKeys error: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to update keys")
		return
	}
	writeJSON(w, http.StatusOK, keys)
}

// ---- Access Control ----
type AccessHandler struct {
	repo *repository.Repo
	hub  *websocket.Hub
}

func NewAccessHandler(repo *repository.Repo, hub *websocket.Hub) *AccessHandler {
	return &AccessHandler{repo: repo, hub: hub}
}

func (h *AccessHandler) GetKey(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	resourceID := chi.URLParam(r, "resourceId")
	ac, err := h.repo.GetAccessKey(r.Context(), resourceID, userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to get access key")
		return
	}
	if ac == nil {
		writeJSON(w, http.StatusOK, nil)
		return
	}
	writeJSON(w, http.StatusOK, ac)
}

func (h *AccessHandler) Grant(w http.ResponseWriter, r *http.Request) {
	var req models.GrantAccessRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	ac, err := h.repo.GrantAccess(r.Context(), req)
	if err != nil {
		log.Printf("GrantAccess error: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to grant access")
		return
	}
	userID := middleware.GetUserID(r)
	h.hub.Broadcast(userID, models.WSEvent{Type: "create", Collection: "access_control", Document: ac, UserID: userID})
	writeJSON(w, http.StatusCreated, ac)
}

// ---- Versions ----
type VersionHandler struct{ repo *repository.Repo }

func NewVersionHandler(repo *repository.Repo) *VersionHandler {
	return &VersionHandler{repo: repo}
}

func (h *VersionHandler) List(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	resourceID := chi.URLParam(r, "resourceId")
	versions, err := h.repo.ListVersions(r.Context(), resourceID, userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list versions")
		return
	}
	writeJSON(w, http.StatusOK, models.ListResponse[models.ResourceVersion]{Total: len(versions), Documents: versions})
}

func (h *VersionHandler) Create(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	var req models.CreateVersionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	version, err := h.repo.CreateVersion(r.Context(), userID, req)
	if err != nil {
		log.Printf("CreateVersion error: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to create version")
		return
	}
	writeJSON(w, http.StatusCreated, version)
}
