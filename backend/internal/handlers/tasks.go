package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/justlabv1/justspace/backend/internal/middleware"
	"github.com/justlabv1/justspace/backend/internal/models"
	"github.com/justlabv1/justspace/backend/internal/repository"
	"github.com/justlabv1/justspace/backend/internal/websocket"
)

type TaskHandler struct {
	repo *repository.Repo
	hub  *websocket.Hub
}

func NewTaskHandler(repo *repository.Repo, hub *websocket.Hub) *TaskHandler {
	return &TaskHandler{repo: repo, hub: hub}
}

func nextRecurringDeadline(task *models.Task) *time.Time {
	if task.Recurrence == nil || *task.Recurrence == "" {
		return nil
	}

	var recurrence models.RecurrenceRule
	if err := json.Unmarshal([]byte(*task.Recurrence), &recurrence); err != nil {
		return nil
	}

	if recurrence.Interval <= 0 {
		recurrence.Interval = 1
	}

	base := task.CreatedAt
	if task.Deadline != nil {
		base = *task.Deadline
	}

	var next time.Time
	switch recurrence.Type {
	case "daily":
		next = base.AddDate(0, 0, recurrence.Interval)
	case "weekly":
		next = base.AddDate(0, 0, 7*recurrence.Interval)
	case "monthly":
		next = base.AddDate(0, recurrence.Interval, 0)
	default:
		return nil
	}

	return &next
}

func (h *TaskHandler) ListByProject(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	projectID := chi.URLParam(r, "projectId")
	tasks, err := h.repo.ListTasks(r.Context(), projectID, userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list tasks")
		return
	}
	writeJSON(w, http.StatusOK, models.ListResponse[models.Task]{Total: len(tasks), Documents: tasks})
}

func (h *TaskHandler) ListAll(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	limit := 100
	if l := r.URL.Query().Get("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 {
			limit = parsed
		}
	}
	tasks, err := h.repo.ListAllTasks(r.Context(), userID, limit)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list tasks")
		return
	}
	writeJSON(w, http.StatusOK, models.ListResponse[models.Task]{Total: len(tasks), Documents: tasks})
}

func (h *TaskHandler) Create(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	var req models.CreateTaskRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	task, err := h.repo.CreateTask(r.Context(), userID, req)
	if err != nil {
		log.Printf("CreateTask error: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to create task")
		return
	}
	h.repo.LogActivity(r.Context(), userID, "create", "Task", task.Title, &task.ProjectID, nil)
	h.hub.Broadcast(userID, models.WSEvent{Type: "create", Collection: "tasks", Document: task, UserID: userID})
	writeJSON(w, http.StatusCreated, task)
}

func (h *TaskHandler) CreateBatch(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	var req models.CreateTasksBatchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	tasks, err := h.repo.CreateTasksBatch(r.Context(), userID, req)
	if err != nil {
		log.Printf("CreateTasksBatch error: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to create tasks")
		return
	}
	name := strconv.Itoa(len(tasks)) + " tasks"
	h.repo.LogActivity(r.Context(), userID, "create", "Task", name, &req.ProjectID, nil)
	h.hub.Broadcast(userID, models.WSEvent{Type: "create", Collection: "tasks", Document: tasks, UserID: userID})
	writeJSON(w, http.StatusCreated, tasks)
}

func (h *TaskHandler) Update(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	id := chi.URLParam(r, "id")
	existingTask, err := h.repo.GetTask(r.Context(), id, userID)
	if err != nil {
		log.Printf("GetTask before update error: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to load task")
		return
	}
	if existingTask == nil {
		writeError(w, http.StatusNotFound, "task not found")
		return
	}
	var req models.UpdateTaskRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Completed != nil && *req.Completed && !existingTask.Completed {
		dependencies := existingTask.Dependencies
		if req.Dependencies != nil {
			dependencies = req.Dependencies
		}

		hasIncompleteDependencies, err := h.repo.HasIncompleteDependencies(r.Context(), userID, dependencies)
		if err != nil {
			log.Printf("Dependency validation error: %v", err)
			writeError(w, http.StatusInternalServerError, "failed to validate task dependencies")
			return
		}
		if hasIncompleteDependencies {
			writeError(w, http.StatusBadRequest, "complete dependent tasks first")
			return
		}
	}

	task, err := h.repo.UpdateTask(r.Context(), id, userID, req)
	if err != nil {
		log.Printf("UpdateTask error: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to update task")
		return
	}

	if req.Completed != nil && *req.Completed && !existingTask.Completed && task.ParentID == nil {
		if nextDeadline := nextRecurringDeadline(task); nextDeadline != nil {
			nextTask, recurringErr := h.repo.CreateRecurringTask(r.Context(), userID, *task, *nextDeadline)
			if recurringErr != nil {
				log.Printf("CreateRecurringTask error: %v", recurringErr)
			} else {
				h.repo.LogActivity(r.Context(), userID, "create", "Task", nextTask.Title, &nextTask.ProjectID, nil)
				h.hub.Broadcast(userID, models.WSEvent{Type: "create", Collection: "tasks", Document: nextTask, UserID: userID})
			}
		}
	}

	if req.Completed != nil && *req.Completed {
		h.repo.LogActivity(r.Context(), userID, "complete", "Task", task.Title, &task.ProjectID, nil)
	} else if req.IsTimerRunning != nil && !*req.IsTimerRunning && req.WorkDuration != nil {
		h.repo.LogActivity(r.Context(), userID, "work", "Task", task.Title, &task.ProjectID, req.WorkDuration)
	} else if req.Title != nil {
		h.repo.LogActivity(r.Context(), userID, "update", "Task", task.Title, &task.ProjectID, nil)
	}
	h.hub.Broadcast(userID, models.WSEvent{Type: "update", Collection: "tasks", Document: task, UserID: userID})
	writeJSON(w, http.StatusOK, task)
}

func (h *TaskHandler) Delete(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	id := chi.URLParam(r, "id")
	if err := h.repo.DeleteTask(r.Context(), id, userID); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to delete task")
		return
	}
	h.repo.LogActivity(r.Context(), userID, "delete", "Task", "Task", nil, nil)
	h.hub.Broadcast(userID, models.WSEvent{Type: "delete", Collection: "tasks", Document: map[string]string{"id": id}, UserID: userID})
	writeJSON(w, http.StatusOK, map[string]string{"message": "deleted"})
}
