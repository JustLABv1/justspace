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

type ProjectHandler struct {
	repo *repository.Repo
	hub  *websocket.Hub
}

func NewProjectHandler(repo *repository.Repo, hub *websocket.Hub) *ProjectHandler {
	return &ProjectHandler{repo: repo, hub: hub}
}

func (h *ProjectHandler) List(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	projects, err := h.repo.ListProjects(r.Context(), userID)
	if err != nil {
		log.Printf("ListProjects error: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to list projects")
		return
	}
	writeJSON(w, http.StatusOK, models.ListResponse[models.Project]{Total: len(projects), Documents: projects})
}

func (h *ProjectHandler) Get(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	id := chi.URLParam(r, "id")
	if !ensureProjectAccess(w, r, h.repo, id, userID) {
		return
	}
	project, err := h.repo.GetProject(r.Context(), id, userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to get project")
		return
	}
	if project == nil {
		writeError(w, http.StatusNotFound, "project not found")
		return
	}
	writeJSON(w, http.StatusOK, project)
}

func (h *ProjectHandler) Create(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	var req models.CreateProjectRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	project, err := h.repo.CreateProject(r.Context(), userID, req)
	if err != nil {
		log.Printf("CreateProject error: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to create project")
		return
	}
	h.repo.LogActivity(r.Context(), userID, "create", "Project", project.Name, &project.ID, nil, nil)
	memberIDs, _ := h.repo.ListProjectMemberUserIDs(r.Context(), project.ID)
	h.hub.BroadcastUsers(memberIDs, models.WSEvent{Type: "create", Collection: "projects", Document: project, UserID: userID})
	if activity, err := h.repo.ListProjectActivity(r.Context(), project.ID, 25); err == nil {
		h.hub.BroadcastUsers(memberIDs, models.WSEvent{Type: "update", Collection: "project_activity", Document: activity, UserID: userID})
	}
	writeJSON(w, http.StatusCreated, project)
}

func (h *ProjectHandler) Update(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	id := chi.URLParam(r, "id")
	if !ensureProjectRole(w, r, h.repo, id, userID, "owner", "admin", "editor") {
		return
	}
	var req models.UpdateProjectRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	project, err := h.repo.UpdateProject(r.Context(), id, userID, req)
	if err != nil {
		log.Printf("UpdateProject error: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to update project")
		return
	}
	h.repo.LogActivity(r.Context(), userID, "update", "Project", project.Name, &project.ID, nil, nil)
	memberIDs, _ := h.repo.ListProjectMemberUserIDs(r.Context(), project.ID)
	h.hub.BroadcastUsers(memberIDs, models.WSEvent{Type: "update", Collection: "projects", Document: project, UserID: userID})
	if activity, err := h.repo.ListProjectActivity(r.Context(), project.ID, 25); err == nil {
		h.hub.BroadcastUsers(memberIDs, models.WSEvent{Type: "update", Collection: "project_activity", Document: activity, UserID: userID})
	}
	writeJSON(w, http.StatusOK, project)
}

func (h *ProjectHandler) Delete(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	id := chi.URLParam(r, "id")
	if !ensureProjectRole(w, r, h.repo, id, userID, "owner") {
		return
	}
	if err := h.repo.DeleteProject(r.Context(), id, userID); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to delete project")
		return
	}
	h.repo.LogActivity(r.Context(), userID, "delete", "Project", "Project", nil, nil, nil)
	h.hub.Broadcast(userID, models.WSEvent{Type: "delete", Collection: "projects", Document: map[string]string{"id": id}, UserID: userID})
	writeJSON(w, http.StatusOK, map[string]string{"message": "deleted"})
}
