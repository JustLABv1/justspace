package handlers

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/justlabv1/justspace/backend/internal/middleware"
	"github.com/justlabv1/justspace/backend/internal/models"
	"github.com/justlabv1/justspace/backend/internal/repository"
	"github.com/justlabv1/justspace/backend/internal/websocket"
)

type MilestoneHandler struct {
	repo *repository.Repo
	hub  *websocket.Hub
}

func NewMilestoneHandler(repo *repository.Repo, hub *websocket.Hub) *MilestoneHandler {
	return &MilestoneHandler{repo: repo, hub: hub}
}

func (h *MilestoneHandler) List(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	projectID := chi.URLParam(r, "projectId")
	if !ensureProjectAccess(w, r, h.repo, projectID, userID) {
		return
	}
	milestones, err := h.repo.ListProjectMilestones(r.Context(), projectID, userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list milestones")
		return
	}
	writeJSON(w, http.StatusOK, models.ListResponse[models.ProjectMilestone]{Total: len(milestones), Documents: milestones})
}

func (h *MilestoneHandler) Create(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	projectID := chi.URLParam(r, "projectId")
	var req models.CreateProjectMilestoneRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	milestone, err := h.repo.CreateProjectMilestone(r.Context(), projectID, userID, req)
	if err != nil {
		writeError(w, http.StatusBadRequest, "failed to create milestone")
		return
	}
	h.broadcastProject(projectID, models.WSEvent{Type: "create", Collection: "project_milestones", Document: milestone, UserID: userID})
	writeJSON(w, http.StatusCreated, milestone)
}

func (h *MilestoneHandler) Update(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	var req models.UpdateProjectMilestoneRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	milestone, err := h.repo.UpdateProjectMilestone(r.Context(), chi.URLParam(r, "id"), userID, req)
	if err != nil {
		writeError(w, http.StatusBadRequest, "failed to update milestone")
		return
	}
	h.broadcastProject(milestone.ProjectID, models.WSEvent{Type: "update", Collection: "project_milestones", Document: milestone, UserID: userID})
	writeJSON(w, http.StatusOK, milestone)
}

func (h *MilestoneHandler) Delete(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	if err := h.repo.DeleteProjectMilestone(r.Context(), chi.URLParam(r, "id"), userID); err != nil {
		writeError(w, http.StatusBadRequest, "failed to delete milestone")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"message": "deleted"})
}

func (h *MilestoneHandler) broadcastProject(projectID string, event models.WSEvent) {
	memberIDs, err := h.repo.ListProjectMemberUserIDs(context.Background(), projectID)
	if err == nil {
		h.hub.BroadcastUsers(memberIDs, event)
	}
}
