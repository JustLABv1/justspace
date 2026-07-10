package handlers

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/justlabv1/justspace/backend/internal/middleware"
	"github.com/justlabv1/justspace/backend/internal/models"
	"github.com/justlabv1/justspace/backend/internal/repository"
	"github.com/justlabv1/justspace/backend/internal/websocket"
)

type NotificationHandler struct {
	repo *repository.Repo
	hub  *websocket.Hub
}

func NewNotificationHandler(repo *repository.Repo, hub *websocket.Hub) *NotificationHandler {
	return &NotificationHandler{repo: repo, hub: hub}
}

func (h *NotificationHandler) List(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	notifications, err := h.repo.ListNotifications(r.Context(), userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list notifications")
		return
	}
	writeJSON(w, http.StatusOK, models.ListResponse[models.Notification]{Total: len(notifications), Documents: notifications})
}

func (h *NotificationHandler) UnreadCount(w http.ResponseWriter, r *http.Request) {
	count, err := h.repo.UnreadNotificationCount(r.Context(), middleware.GetUserID(r))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to count notifications")
		return
	}
	writeJSON(w, http.StatusOK, map[string]int{"count": count})
}

func (h *NotificationHandler) MarkRead(w http.ResponseWriter, r *http.Request) {
	notification, err := h.repo.MarkNotificationRead(r.Context(), chi.URLParam(r, "id"), middleware.GetUserID(r))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to mark notification read")
		return
	}
	if notification == nil {
		writeError(w, http.StatusNotFound, "notification not found")
		return
	}
	writeJSON(w, http.StatusOK, notification)
}

func (h *NotificationHandler) Delete(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	id := chi.URLParam(r, "id")
	deleted, err := h.repo.DeleteNotification(r.Context(), id, userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to delete notification")
		return
	}
	if !deleted {
		writeError(w, http.StatusNotFound, "notification not found")
		return
	}
	h.hub.Broadcast(userID, models.WSEvent{Type: "delete", Collection: "notifications", Document: map[string]string{"id": id}, UserID: userID})
	writeJSON(w, http.StatusOK, map[string]string{"message": "notification deleted"})
}
