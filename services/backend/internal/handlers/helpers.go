package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/justlabv1/justspace/backend/internal/models"
	"github.com/justlabv1/justspace/backend/internal/repository"
)

func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func writeError(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{"error": message})
}

func ensureProjectAccess(w http.ResponseWriter, r *http.Request, repo *repository.Repo, projectID, userID string) bool {
	allowed, err := repo.CanAccessProject(r.Context(), projectID, userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to validate project access")
		return false
	}
	if !allowed {
		writeError(w, http.StatusForbidden, "project access denied")
		return false
	}
	return true
}

func ensureProjectRole(w http.ResponseWriter, r *http.Request, repo *repository.Repo, projectID, userID string, roles ...string) bool {
	allowed, err := repo.RequireProjectRole(r.Context(), projectID, userID, roles...)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to validate project role")
		return false
	}
	if !allowed {
		writeError(w, http.StatusForbidden, "insufficient project permissions")
		return false
	}
	return true
}

func ensureTaskAccess(w http.ResponseWriter, r *http.Request, repo *repository.Repo, taskID, userID string) (*models.Task, bool) {
	task, err := repo.GetTask(r.Context(), taskID, userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to validate task access")
		return nil, false
	}
	if task == nil {
		writeError(w, http.StatusNotFound, "task not found")
		return nil, false
	}
	return task, true
}
