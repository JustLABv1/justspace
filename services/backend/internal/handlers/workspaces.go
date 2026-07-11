package handlers

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/justlabv1/justspace/backend/internal/middleware"
	"github.com/justlabv1/justspace/backend/internal/models"
	"github.com/justlabv1/justspace/backend/internal/repository"
	"github.com/justlabv1/justspace/backend/internal/websocket"
)

type WorkspaceHandler struct {
	repo *repository.Repo
	hub  *websocket.Hub
}

func NewWorkspaceHandler(repo *repository.Repo, hub *websocket.Hub) *WorkspaceHandler {
	return &WorkspaceHandler{repo: repo, hub: hub}
}

func (h *WorkspaceHandler) List(w http.ResponseWriter, r *http.Request) {
	workspaces, err := h.repo.ListWorkspaces(r.Context(), middleware.GetUserID(r))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list workspaces")
		return
	}
	writeJSON(w, http.StatusOK, models.ListResponse[models.Workspace]{Total: len(workspaces), Documents: workspaces})
}

func (h *WorkspaceHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req models.CreateWorkspaceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	workspace, err := h.repo.CreateWorkspace(r.Context(), middleware.GetUserID(r), req)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	h.hub.Broadcast(middleware.GetUserID(r), models.WSEvent{Type: "create", Collection: "workspaces", Document: workspace, UserID: middleware.GetUserID(r)})
	writeJSON(w, http.StatusCreated, workspace)
}

func (h *WorkspaceHandler) Update(w http.ResponseWriter, r *http.Request) {
	var req models.UpdateWorkspaceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	workspace, err := h.repo.UpdateWorkspace(r.Context(), chi.URLParam(r, "id"), middleware.GetUserID(r), req)
	if err != nil {
		writeError(w, http.StatusBadRequest, "failed to update workspace")
		return
	}
	h.broadcastWorkspace(r.Context(), workspace.ID, models.WSEvent{Type: "update", Collection: "workspaces", Document: workspace, UserID: middleware.GetUserID(r)})
	writeJSON(w, http.StatusOK, workspace)
}

func (h *WorkspaceHandler) ListMembers(w http.ResponseWriter, r *http.Request) {
	workspaceID := chi.URLParam(r, "workspaceId")
	userID := middleware.GetUserID(r)
	if !ensureWorkspaceAccess(w, r, h.repo, workspaceID, userID) {
		return
	}
	members, err := h.repo.ListWorkspaceMembers(r.Context(), workspaceID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list workspace members")
		return
	}
	writeJSON(w, http.StatusOK, models.ListResponse[models.WorkspaceMember]{Total: len(members), Documents: members})
}

func (h *WorkspaceHandler) AddMember(w http.ResponseWriter, r *http.Request) {
	workspaceID := chi.URLParam(r, "workspaceId")
	userID := middleware.GetUserID(r)
	if !ensureWorkspaceRole(w, r, h.repo, workspaceID, userID, "owner", "admin") {
		return
	}
	var req models.CreateWorkspaceMemberRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	req.Role = strings.ToLower(strings.TrimSpace(req.Role))
	if req.UserID == "" || !validWorkspaceRole(req.Role) {
		writeError(w, http.StatusBadRequest, "userId and a valid role are required")
		return
	}
	actorRole, _ := h.repo.GetWorkspaceRole(r.Context(), workspaceID, userID)
	if actorRole == "admin" && req.Role == "admin" {
		writeError(w, http.StatusForbidden, "admins cannot add another admin")
		return
	}
	member, err := h.repo.CreateWorkspaceMember(r.Context(), workspaceID, req.UserID, req.Role)
	if err != nil {
		writeError(w, http.StatusBadRequest, "failed to add workspace member")
		return
	}
	h.broadcastWorkspace(r.Context(), workspaceID, models.WSEvent{Type: "create", Collection: "workspace_members", Document: member, UserID: userID})
	writeJSON(w, http.StatusCreated, member)
}

func (h *WorkspaceHandler) UpdateMemberRole(w http.ResponseWriter, r *http.Request) {
	workspaceID := chi.URLParam(r, "workspaceId")
	userID := middleware.GetUserID(r)
	if !ensureWorkspaceRole(w, r, h.repo, workspaceID, userID, "owner", "admin") {
		return
	}
	var req models.UpdateWorkspaceMemberRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	req.Role = strings.ToLower(strings.TrimSpace(req.Role))
	if !validWorkspaceRole(req.Role) {
		writeError(w, http.StatusBadRequest, "a valid role is required")
		return
	}
	actorRole, _ := h.repo.GetWorkspaceRole(r.Context(), workspaceID, userID)
	if actorRole == "admin" && req.Role == "admin" {
		writeError(w, http.StatusForbidden, "admins cannot promote another admin")
		return
	}
	member, err := h.repo.UpdateWorkspaceMemberRole(r.Context(), workspaceID, chi.URLParam(r, "userId"), req.Role)
	if err != nil {
		writeError(w, http.StatusBadRequest, "failed to update workspace member")
		return
	}
	h.broadcastWorkspace(r.Context(), workspaceID, models.WSEvent{Type: "update", Collection: "workspace_members", Document: member, UserID: userID})
	writeJSON(w, http.StatusOK, member)
}

func (h *WorkspaceHandler) RemoveMember(w http.ResponseWriter, r *http.Request) {
	workspaceID := chi.URLParam(r, "workspaceId")
	userID := middleware.GetUserID(r)
	if !ensureWorkspaceRole(w, r, h.repo, workspaceID, userID, "owner", "admin") {
		return
	}
	targetUserID := chi.URLParam(r, "userId")
	projectIDs, err := h.repo.RemoveWorkspaceMember(r.Context(), workspaceID, targetUserID)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	for _, projectID := range projectIDs {
		memberIDs, listErr := h.repo.ListProjectMemberUserIDs(r.Context(), projectID)
		if listErr == nil {
			h.hub.BroadcastUsers(memberIDs, models.WSEvent{Type: "delete", Collection: "project_members", Document: map[string]string{"projectId": projectID, "userId": targetUserID}, UserID: userID})
		}
		h.hub.Broadcast(targetUserID, models.WSEvent{Type: "delete", Collection: "projects", Document: map[string]string{"id": projectID}, UserID: userID})
	}
	h.broadcastWorkspace(r.Context(), workspaceID, models.WSEvent{Type: "delete", Collection: "workspace_members", Document: map[string]string{"workspaceId": workspaceID, "userId": targetUserID}, UserID: userID})
	writeJSON(w, http.StatusOK, map[string]string{"message": "workspace member removed"})
}

func (h *WorkspaceHandler) ListInvitations(w http.ResponseWriter, r *http.Request) {
	workspaceID := chi.URLParam(r, "workspaceId")
	userID := middleware.GetUserID(r)
	if !ensureWorkspaceAccess(w, r, h.repo, workspaceID, userID) {
		return
	}
	invitations, err := h.repo.ListWorkspaceInvitations(r.Context(), workspaceID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list workspace invitations")
		return
	}
	writeJSON(w, http.StatusOK, models.ListResponse[models.WorkspaceInvitation]{Total: len(invitations), Documents: invitations})
}

func (h *WorkspaceHandler) CreateInvitation(w http.ResponseWriter, r *http.Request) {
	workspaceID := chi.URLParam(r, "workspaceId")
	userID := middleware.GetUserID(r)
	if !ensureWorkspaceRole(w, r, h.repo, workspaceID, userID, "owner", "admin") {
		return
	}
	var req models.CreateWorkspaceInvitationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	req.Email = strings.ToLower(strings.TrimSpace(req.Email))
	req.Role = strings.ToLower(strings.TrimSpace(req.Role))
	if req.Email == "" || !strings.Contains(req.Email, "@") || !validWorkspaceRole(req.Role) {
		writeError(w, http.StatusBadRequest, "email and a valid role are required")
		return
	}
	if currentRole, _ := h.repo.GetWorkspaceRole(r.Context(), workspaceID, userID); currentRole == "admin" && req.Role == "admin" {
		writeError(w, http.StatusForbidden, "admins cannot invite another admin")
		return
	}
	targetUser, err := h.repo.GetUserByEmail(r.Context(), req.Email)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load invited user")
		return
	}
	var invitedUserID *string
	if targetUser != nil {
		invitedUserID = &targetUser.ID
		if allowed, accessErr := h.repo.CanAccessWorkspace(r.Context(), workspaceID, targetUser.ID); accessErr != nil {
			writeError(w, http.StatusInternalServerError, "failed to check existing membership")
			return
		} else if allowed {
			writeError(w, http.StatusConflict, "user is already a workspace member")
			return
		}
	}
	token, err := randomWorkspaceToken()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to generate invitation token")
		return
	}
	invite, err := h.repo.CreateWorkspaceInvitation(r.Context(), userID, req, workspaceID, hashInvitationToken(token), invitedUserID, time.Now().Add(7*24*time.Hour))
	if err != nil {
		writeError(w, http.StatusBadRequest, "failed to create workspace invitation")
		return
	}
	invite.Token = &token
	h.broadcastWorkspace(r.Context(), workspaceID, models.WSEvent{Type: "create", Collection: "workspace_invitations", Document: invite, UserID: userID})
	writeJSON(w, http.StatusCreated, invite)
}

func (h *WorkspaceHandler) CancelInvitation(w http.ResponseWriter, r *http.Request) {
	workspaceID := chi.URLParam(r, "workspaceId")
	userID := middleware.GetUserID(r)
	if !ensureWorkspaceRole(w, r, h.repo, workspaceID, userID, "owner", "admin") {
		return
	}
	if err := h.repo.CancelWorkspaceInvitation(r.Context(), workspaceID, chi.URLParam(r, "invitationId")); err != nil {
		writeError(w, http.StatusBadRequest, "failed to cancel workspace invitation")
		return
	}
	h.broadcastWorkspace(r.Context(), workspaceID, models.WSEvent{Type: "delete", Collection: "workspace_invitations", Document: map[string]string{"workspaceId": workspaceID, "id": chi.URLParam(r, "invitationId")}, UserID: userID})
	writeJSON(w, http.StatusOK, map[string]string{"message": "workspace invitation cancelled"})
}

func (h *WorkspaceHandler) broadcastWorkspace(ctx context.Context, workspaceID string, event models.WSEvent) {
	members, err := h.repo.ListWorkspaceMembers(ctx, workspaceID)
	if err != nil {
		return
	}
	userIDs := make([]string, 0, len(members))
	for _, member := range members {
		userIDs = append(userIDs, member.UserID)
	}
	h.hub.BroadcastUsers(userIDs, event)
}

func validWorkspaceRole(role string) bool {
	return role == "admin" || role == "member" || role == "guest"
}

func randomWorkspaceToken() (string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}
