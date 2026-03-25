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

type WikiHandler struct {
	repo *repository.Repo
	hub  *websocket.Hub
}

func NewWikiHandler(repo *repository.Repo, hub *websocket.Hub) *WikiHandler {
	return &WikiHandler{repo: repo, hub: hub}
}

func (h *WikiHandler) List(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	guides, err := h.repo.ListGuides(r.Context(), userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list guides")
		return
	}
	writeJSON(w, http.StatusOK, models.ListResponse[models.WikiGuide]{Total: len(guides), Documents: guides})
}

func (h *WikiHandler) Get(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	id := chi.URLParam(r, "id")
	guide, err := h.repo.GetGuide(r.Context(), id, userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to get guide")
		return
	}
	if guide == nil {
		writeError(w, http.StatusNotFound, "guide not found")
		return
	}
	writeJSON(w, http.StatusOK, guide)
}

func (h *WikiHandler) Create(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	var req models.CreateGuideRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	guide, err := h.repo.CreateGuide(r.Context(), userID, req)
	if err != nil {
		log.Printf("CreateGuide error: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to create guide")
		return
	}
	h.repo.LogActivity(r.Context(), userID, "create", "Wiki", guide.Title, &guide.ID, nil)
	h.hub.Broadcast(userID, models.WSEvent{Type: "create", Collection: "wiki_guides", Document: guide, UserID: userID})
	writeJSON(w, http.StatusCreated, guide)
}

func (h *WikiHandler) Update(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	id := chi.URLParam(r, "id")
	var req models.UpdateGuideRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	guide, err := h.repo.UpdateGuide(r.Context(), id, userID, req)
	if err != nil {
		log.Printf("UpdateGuide error: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to update guide")
		return
	}
	h.repo.LogActivity(r.Context(), userID, "update", "Wiki", guide.Title, &guide.ID, nil)
	h.hub.Broadcast(userID, models.WSEvent{Type: "update", Collection: "wiki_guides", Document: guide, UserID: userID})
	writeJSON(w, http.StatusOK, guide)
}

func (h *WikiHandler) Delete(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	id := chi.URLParam(r, "id")
	if err := h.repo.DeleteGuide(r.Context(), id, userID); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to delete guide")
		return
	}
	h.repo.LogActivity(r.Context(), userID, "delete", "Wiki", "Guide", nil, nil)
	h.hub.Broadcast(userID, models.WSEvent{Type: "delete", Collection: "wiki_guides", Document: map[string]string{"id": id}, UserID: userID})
	writeJSON(w, http.StatusOK, map[string]string{"message": "deleted"})
}

type InstallationHandler struct {
	repo *repository.Repo
	hub  *websocket.Hub
}

func NewInstallationHandler(repo *repository.Repo, hub *websocket.Hub) *InstallationHandler {
	return &InstallationHandler{repo: repo, hub: hub}
}

func (h *InstallationHandler) Create(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	var req models.CreateInstallationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	inst, err := h.repo.CreateInstallation(r.Context(), userID, req)
	if err != nil {
		log.Printf("CreateInstallation error: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to create installation")
		return
	}
	h.repo.LogActivity(r.Context(), userID, "create", "Installation", inst.Target, nil, nil)
	h.hub.Broadcast(userID, models.WSEvent{Type: "create", Collection: "installations", Document: inst, UserID: userID})
	writeJSON(w, http.StatusCreated, inst)
}

func (h *InstallationHandler) Update(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	id := chi.URLParam(r, "id")
	var req models.UpdateInstallationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	inst, err := h.repo.UpdateInstallation(r.Context(), id, userID, req)
	if err != nil {
		log.Printf("UpdateInstallation error: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to update installation")
		return
	}
	if req.Target != nil {
		h.repo.LogActivity(r.Context(), userID, "update", "Installation", *req.Target, nil, nil)
	}
	h.hub.Broadcast(userID, models.WSEvent{Type: "update", Collection: "installations", Document: inst, UserID: userID})
	writeJSON(w, http.StatusOK, inst)
}

func (h *InstallationHandler) Delete(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	id := chi.URLParam(r, "id")
	if err := h.repo.DeleteInstallation(r.Context(), id, userID); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to delete installation")
		return
	}
	h.repo.LogActivity(r.Context(), userID, "delete", "Installation", "Installation", nil, nil)
	h.hub.Broadcast(userID, models.WSEvent{Type: "delete", Collection: "installations", Document: map[string]string{"id": id}, UserID: userID})
	writeJSON(w, http.StatusOK, map[string]string{"message": "deleted"})
}
