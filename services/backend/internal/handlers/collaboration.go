package handlers

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"mime/multipart"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/justlabv1/justspace/backend/internal/middleware"
	"github.com/justlabv1/justspace/backend/internal/models"
	"github.com/justlabv1/justspace/backend/internal/repository"
	"github.com/justlabv1/justspace/backend/internal/storage"
	"github.com/justlabv1/justspace/backend/internal/websocket"
)

type CollaborationHandler struct {
	repo           *repository.Repo
	hub            *websocket.Hub
	fileStore      *storage.FileStore
	maxUploadBytes int64
}

func NewCollaborationHandler(repo *repository.Repo, hub *websocket.Hub, fileStore *storage.FileStore, maxUploadBytes int64) *CollaborationHandler {
	return &CollaborationHandler{repo: repo, hub: hub, fileStore: fileStore, maxUploadBytes: maxUploadBytes}
}

func (h *CollaborationHandler) SearchUsers(w http.ResponseWriter, r *http.Request) {
	query := strings.TrimSpace(r.URL.Query().Get("q"))
	if len(query) < 2 {
		writeJSON(w, http.StatusOK, models.ListResponse[models.UserLookup]{Total: 0, Documents: []models.UserLookup{}})
		return
	}
	users, err := h.repo.SearchUsers(r.Context(), query, 10)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to search users")
		return
	}
	writeJSON(w, http.StatusOK, models.ListResponse[models.UserLookup]{Total: len(users), Documents: users})
}

func (h *CollaborationHandler) ListMembers(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	projectID := chi.URLParam(r, "projectId")
	if !ensureProjectAccess(w, r, h.repo, projectID, userID) {
		return
	}
	members, err := h.repo.ListProjectMembers(r.Context(), projectID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list members")
		return
	}
	writeJSON(w, http.StatusOK, models.ListResponse[models.ProjectMember]{Total: len(members), Documents: members})
}

func (h *CollaborationHandler) AddMember(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	projectID := chi.URLParam(r, "projectId")
	if !ensureProjectRole(w, r, h.repo, projectID, userID, "owner", "admin") {
		return
	}

	var req models.CreateProjectMemberRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	req.ProjectID = projectID
	if req.UserID == "" || !validAssignableProjectRole(req.Role) {
		writeError(w, http.StatusBadRequest, "userId and a valid project role are required")
		return
	}

	project, err := h.repo.GetProject(r.Context(), projectID, userID)
	if err != nil || project == nil {
		writeError(w, http.StatusNotFound, "project not found")
		return
	}
	if allowed, accessErr := h.repo.CanAccessWorkspace(r.Context(), project.WorkspaceID, req.UserID); accessErr != nil {
		writeError(w, http.StatusInternalServerError, "failed to validate workspace membership")
		return
	} else if !allowed {
		writeError(w, http.StatusBadRequest, "add the person to the workspace before adding them to a project")
		return
	}
	if project.IsEncrypted && req.EncryptedKey == nil {
		writeError(w, http.StatusBadRequest, "encryptedKey is required for encrypted projects")
		return
	}

	var member *models.ProjectMember
	if project.IsEncrypted {
		member, err = h.repo.CreateEncryptedProjectMember(r.Context(), projectID, req.UserID, req.Role, *req.EncryptedKey)
	} else {
		member, err = h.repo.CreateProjectMember(r.Context(), projectID, req.UserID, req.Role)
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to add project member")
		return
	}
	h.broadcastProject(projectID, models.WSEvent{Type: "create", Collection: "project_members", Document: member, UserID: userID})
	writeJSON(w, http.StatusCreated, member)
}

func (h *CollaborationHandler) UpdateMemberRole(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	projectID := chi.URLParam(r, "projectId")
	targetUserID := chi.URLParam(r, "userId")
	if !ensureProjectRole(w, r, h.repo, projectID, userID, "owner", "admin") {
		return
	}
	var req models.UpdateProjectMemberRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if !validAssignableProjectRole(req.Role) {
		writeError(w, http.StatusBadRequest, "a valid project role is required")
		return
	}
	member, err := h.repo.UpdateProjectMemberRole(r.Context(), projectID, targetUserID, req.Role)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update member")
		return
	}
	h.broadcastProject(projectID, models.WSEvent{Type: "update", Collection: "project_members", Document: member, UserID: userID})
	writeJSON(w, http.StatusOK, member)
}

// Owner is intentionally excluded: ownership may only be transferred through
// a dedicated owner-only operation, never through ordinary member management.
func validAssignableProjectRole(role string) bool {
	return role == "admin" || role == "editor" || role == "viewer"
}

func (h *CollaborationHandler) RemoveMember(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	projectID := chi.URLParam(r, "projectId")
	targetUserID := chi.URLParam(r, "userId")
	if !ensureProjectRole(w, r, h.repo, projectID, userID, "owner", "admin") {
		return
	}
	if err := h.repo.RemoveProjectMember(r.Context(), projectID, targetUserID); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to remove member")
		return
	}
	if err := h.repo.RemoveAccess(r.Context(), projectID, targetUserID); err != nil {
		log.Printf("RemoveMember access cleanup error: %v", err)
	}
	h.broadcastProject(projectID, models.WSEvent{
		Type:       "delete",
		Collection: "project_members",
		Document:   map[string]string{"userId": targetUserID, "projectId": projectID},
		UserID:     userID,
	})
	writeJSON(w, http.StatusOK, map[string]string{"message": "member removed"})
}

func (h *CollaborationHandler) ListInvitations(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	projectID := chi.URLParam(r, "projectId")
	if !ensureProjectAccess(w, r, h.repo, projectID, userID) {
		return
	}
	invites, err := h.repo.ListInvitations(r.Context(), projectID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list invitations")
		return
	}
	writeJSON(w, http.StatusOK, models.ListResponse[models.TeamInvitation]{Total: len(invites), Documents: invites})
}

func (h *CollaborationHandler) CreateInvitation(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	projectID := chi.URLParam(r, "projectId")
	if !ensureProjectRole(w, r, h.repo, projectID, userID, "owner", "admin") {
		return
	}
	var req models.CreateInvitationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	req.ProjectID = projectID
	req.Email = strings.ToLower(strings.TrimSpace(req.Email))
	req.WorkspaceRole = "member"
	if req.Email == "" || req.Role == "" {
		writeError(w, http.StatusBadRequest, "email and role are required")
		return
	}

	project, err := h.repo.GetProject(r.Context(), projectID, userID)
	if err != nil || project == nil {
		writeError(w, http.StatusNotFound, "project not found")
		return
	}

	var invitedUserID *string
	targetUser, err := h.repo.GetUserByEmail(r.Context(), req.Email)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load invited user")
		return
	}
	if targetUser != nil {
		invitedUserID = &targetUser.ID
		if allowed, accessErr := h.repo.CanAccessWorkspace(r.Context(), project.WorkspaceID, targetUser.ID); accessErr != nil {
			writeError(w, http.StatusInternalServerError, "failed to validate workspace membership")
			return
		} else if allowed {
			writeError(w, http.StatusConflict, "user already belongs to the workspace; add them directly to the project")
			return
		}
	}
	if project.IsEncrypted && (targetUser == nil || req.EncryptedKey == nil) {
		writeError(w, http.StatusBadRequest, "encrypted projects require an existing vault-enabled user and encryptedKey")
		return
	}

	token, err := randomToken()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to generate invitation token")
		return
	}
	tokenHash := hashInvitationToken(token)
	invite, err := h.repo.CreateInvitation(r.Context(), userID, req, tokenHash, invitedUserID, time.Now().Add(7*24*time.Hour))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create invitation")
		return
	}
	invite.Token = &token

	if project.IsEncrypted && invitedUserID != nil && req.EncryptedKey != nil {
		if _, err := h.repo.GrantAccess(r.Context(), models.GrantAccessRequest{
			ResourceID:   projectID,
			UserID:       *invitedUserID,
			EncryptedKey: *req.EncryptedKey,
			ResourceType: "Project",
		}); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to prepare encrypted project access")
			return
		}
	}

	h.broadcastProject(projectID, models.WSEvent{Type: "create", Collection: "team_invitations", Document: invite, UserID: userID})
	writeJSON(w, http.StatusCreated, invite)
}

func (h *CollaborationHandler) AcceptInvitation(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	currentUser, err := h.repo.GetUserByID(r.Context(), userID)
	if err != nil || currentUser == nil {
		writeError(w, http.StatusUnauthorized, "user not found")
		return
	}

	var req models.AcceptInvitationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	invite, err := h.repo.GetInvitationByTokenHash(r.Context(), hashInvitationToken(req.Token))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load invitation")
		return
	}
	if invite == nil {
		workspaceInvite, workspaceErr := h.repo.GetWorkspaceInvitationByTokenHash(r.Context(), hashInvitationToken(req.Token))
		if workspaceErr != nil {
			writeError(w, http.StatusInternalServerError, "failed to load workspace invitation")
			return
		}
		if workspaceInvite == nil || workspaceInvite.Status != "pending" {
			writeError(w, http.StatusNotFound, "invitation not found")
			return
		}
		if time.Now().After(workspaceInvite.ExpiresAt) {
			writeError(w, http.StatusBadRequest, "invitation expired")
			return
		}
		if strings.ToLower(workspaceInvite.Email) != strings.ToLower(currentUser.Email) {
			writeError(w, http.StatusForbidden, "invitation email does not match current user")
			return
		}
		if _, err := h.repo.CreateWorkspaceMember(r.Context(), workspaceInvite.WorkspaceID, userID, workspaceInvite.Role); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to join workspace")
			return
		}
		if err := h.repo.AcceptWorkspaceInvitation(r.Context(), workspaceInvite.ID, userID); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to accept workspace invitation")
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"workspaceId": workspaceInvite.WorkspaceID})
		return
	}
	if invite == nil || invite.Status != "pending" {
		writeError(w, http.StatusNotFound, "invitation not found")
		return
	}
	if time.Now().After(invite.ExpiresAt) {
		writeError(w, http.StatusBadRequest, "invitation expired")
		return
	}
	if strings.ToLower(invite.Email) != strings.ToLower(currentUser.Email) {
		writeError(w, http.StatusForbidden, "invitation email does not match current user")
		return
	}

	if _, err := h.repo.AcceptInvitation(r.Context(), invite.ID, userID); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to accept invitation")
		return
	}

	members, _ := h.repo.ListProjectMembers(r.Context(), invite.ProjectID)
	h.broadcastProject(invite.ProjectID, models.WSEvent{Type: "update", Collection: "project_members", Document: members, UserID: userID})
	writeJSON(w, http.StatusOK, map[string]string{"projectId": invite.ProjectID})
}

func (h *CollaborationHandler) CancelInvitation(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	projectID := chi.URLParam(r, "projectId")
	invitationID := chi.URLParam(r, "invitationId")
	if !ensureProjectRole(w, r, h.repo, projectID, userID, "owner", "admin") {
		return
	}
	if err := h.repo.CancelInvitation(r.Context(), invitationID); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to cancel invitation")
		return
	}
	h.broadcastProject(projectID, models.WSEvent{
		Type:       "delete",
		Collection: "team_invitations",
		Document:   map[string]string{"id": invitationID, "projectId": projectID},
		UserID:     userID,
	})
	writeJSON(w, http.StatusOK, map[string]string{"message": "invitation cancelled"})
}

func (h *CollaborationHandler) ListProjectFiles(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	projectID := chi.URLParam(r, "projectId")
	if !ensureProjectAccess(w, r, h.repo, projectID, userID) {
		return
	}
	files, err := h.repo.ListProjectFiles(r.Context(), projectID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list files")
		return
	}
	writeJSON(w, http.StatusOK, models.ListResponse[models.ProjectFile]{Total: len(files), Documents: files})
}

func (h *CollaborationHandler) UploadProjectFile(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	projectID := chi.URLParam(r, "projectId")
	if !ensureProjectRole(w, r, h.repo, projectID, userID, "owner", "admin", "editor") {
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, h.maxUploadBytes)
	if err := r.ParseMultipartForm(h.maxUploadBytes); err != nil {
		writeError(w, http.StatusBadRequest, "failed to parse upload")
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		writeError(w, http.StatusBadRequest, "missing file")
		return
	}
	defer file.Close()

	req := models.CreateProjectFileRequest{
		ProjectID:     projectID,
		TaskID:        "",
		EncryptedName: r.FormValue("encryptedName"),
		ContentType:   r.FormValue("contentType"),
		IV:            r.FormValue("iv"),
		IsEncrypted:   r.FormValue("isEncrypted") != "false",
	}
	if req.EncryptedName == "" {
		writeError(w, http.StatusBadRequest, "encryptedName is required")
		return
	}
	if req.ContentType == "" {
		req.ContentType = "application/octet-stream"
	}

	uploadID, err := randomToken()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to allocate file id")
		return
	}
	storagePath := fmt.Sprintf("%s/%s-%s.bin", projectID, time.Now().UTC().Format("20060102150405"), uploadID)
	if err := h.fileStore.Save(r.Context(), storagePath, limitFileReader(file, header.Size)); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to store file")
		return
	}

	projectFile, err := h.repo.CreateProjectFile(r.Context(), userID, req, header.Size, storagePath)
	if err != nil {
		_ = h.fileStore.Delete(storagePath)
		writeError(w, http.StatusInternalServerError, "failed to save file metadata")
		return
	}

	if _, err := h.repo.LogActivity(r.Context(), userID, "create", "File", req.EncryptedName, &projectID, nil, nil); err == nil {
		h.broadcastProjectActivity(projectID, userID)
	}
	h.broadcastProject(projectID, models.WSEvent{Type: "create", Collection: "project_files", Document: projectFile, UserID: userID})
	writeJSON(w, http.StatusCreated, projectFile)
}

func (h *CollaborationHandler) ListTaskFiles(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	taskID := chi.URLParam(r, "taskId")
	task, err := h.repo.GetTask(r.Context(), taskID, userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load task")
		return
	}
	if task == nil {
		writeError(w, http.StatusNotFound, "task not found")
		return
	}
	files, err := h.repo.ListTaskFiles(r.Context(), taskID, userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list task files")
		return
	}
	writeJSON(w, http.StatusOK, models.ListResponse[models.ProjectFile]{Total: len(files), Documents: files})
}

func (h *CollaborationHandler) UploadTaskFile(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	taskID := chi.URLParam(r, "taskId")
	task, err := h.repo.GetTask(r.Context(), taskID, userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load task")
		return
	}
	if task == nil {
		writeError(w, http.StatusNotFound, "task not found")
		return
	}
	if !ensureProjectRole(w, r, h.repo, task.ProjectID, userID, "owner", "admin", "editor") {
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, h.maxUploadBytes)
	if err := r.ParseMultipartForm(h.maxUploadBytes); err != nil {
		writeError(w, http.StatusBadRequest, "failed to parse upload")
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		writeError(w, http.StatusBadRequest, "missing file")
		return
	}
	defer file.Close()

	req := models.CreateProjectFileRequest{
		ProjectID:     task.ProjectID,
		TaskID:        taskID,
		EncryptedName: r.FormValue("encryptedName"),
		ContentType:   r.FormValue("contentType"),
		IV:            r.FormValue("iv"),
		IsEncrypted:   r.FormValue("isEncrypted") != "false",
	}
	if req.EncryptedName == "" {
		writeError(w, http.StatusBadRequest, "encryptedName is required")
		return
	}
	if req.ContentType == "" {
		req.ContentType = "application/octet-stream"
	}

	uploadID, err := randomToken()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to allocate file id")
		return
	}
	storagePath := fmt.Sprintf("%s/tasks/%s/%s-%s.bin", task.ProjectID, taskID, time.Now().UTC().Format("20060102150405"), uploadID)
	if err := h.fileStore.Save(r.Context(), storagePath, limitFileReader(file, header.Size)); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to store file")
		return
	}

	taskFile, err := h.repo.CreateProjectFile(r.Context(), userID, req, header.Size, storagePath)
	if err != nil {
		_ = h.fileStore.Delete(storagePath)
		writeError(w, http.StatusInternalServerError, "failed to save file metadata")
		return
	}

	if _, err := h.repo.LogActivity(r.Context(), userID, "create", "File", req.EncryptedName, &task.ProjectID, &task.ID, nil); err == nil {
		h.broadcastProjectActivity(task.ProjectID, userID)
	}
	h.broadcastProject(task.ProjectID, models.WSEvent{Type: "create", Collection: "project_files", Document: taskFile, UserID: userID})
	writeJSON(w, http.StatusCreated, taskFile)
}

func (h *CollaborationHandler) ListTaskAssignees(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	taskID := chi.URLParam(r, "taskId")
	if _, ok := ensureTaskAccess(w, r, h.repo, taskID, userID); !ok {
		return
	}
	assignees, err := h.repo.ListTaskAssignees(r.Context(), taskID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list task assignees")
		return
	}
	writeJSON(w, http.StatusOK, models.ListResponse[models.TaskAssignee]{Total: len(assignees), Documents: assignees})
}

func (h *CollaborationHandler) AddTaskAssignee(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	taskID := chi.URLParam(r, "taskId")
	task, ok := ensureTaskAccess(w, r, h.repo, taskID, userID)
	if !ok {
		return
	}
	if !ensureProjectRole(w, r, h.repo, task.ProjectID, userID, "owner", "admin", "editor") {
		return
	}
	var req models.AssignTaskUserRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.UserID == "" {
		writeError(w, http.StatusBadRequest, "userId is required")
		return
	}
	member, err := h.repo.IsProjectMember(r.Context(), task.ProjectID, req.UserID)
	if err != nil || !member {
		writeError(w, http.StatusBadRequest, "assignee must be a project member")
		return
	}
	alreadyAssigned, err := h.repo.HasTaskAssignee(r.Context(), taskID, req.UserID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to check task assignee")
		return
	}
	assignee, err := h.repo.AddTaskAssignee(r.Context(), taskID, req.UserID, userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to assign task")
		return
	}
	meta := fmt.Sprintf("Assigned %s", assignee.Name)
	if _, err := h.repo.LogActivity(r.Context(), userID, "update", "Task", task.Title, &task.ProjectID, &task.ID, &meta); err == nil {
		h.broadcastProjectActivity(task.ProjectID, userID)
		h.broadcastTaskActivity(task.ProjectID, task.ID, userID)
	}
	h.broadcastProject(task.ProjectID, models.WSEvent{Type: "create", Collection: "task_assignees", Document: assignee, UserID: userID})
	if !alreadyAssigned {
		if notification, err := h.repo.CreateNotification(r.Context(), req.UserID, userID, "task_assigned", task.ProjectID, task.ID, nil); err != nil {
			log.Printf("create assignment notification error: %v", err)
		} else if notification != nil {
			h.hub.Broadcast(req.UserID, models.WSEvent{Type: "create", Collection: "notifications", Document: notification, UserID: userID})
		}
	}
	writeJSON(w, http.StatusCreated, assignee)
}

func (h *CollaborationHandler) RemoveTaskAssignee(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	taskID := chi.URLParam(r, "taskId")
	targetUserID := chi.URLParam(r, "userId")
	task, ok := ensureTaskAccess(w, r, h.repo, taskID, userID)
	if !ok {
		return
	}
	if !ensureProjectRole(w, r, h.repo, task.ProjectID, userID, "owner", "admin", "editor") {
		return
	}
	if err := h.repo.RemoveTaskAssignee(r.Context(), taskID, targetUserID); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to remove assignee")
		return
	}
	meta := fmt.Sprintf("Unassigned user %s", targetUserID)
	if _, err := h.repo.LogActivity(r.Context(), userID, "update", "Task", task.Title, &task.ProjectID, &task.ID, &meta); err == nil {
		h.broadcastProjectActivity(task.ProjectID, userID)
		h.broadcastTaskActivity(task.ProjectID, task.ID, userID)
	}
	h.broadcastProject(task.ProjectID, models.WSEvent{
		Type:       "delete",
		Collection: "task_assignees",
		Document:   map[string]string{"taskId": taskID, "userId": targetUserID},
		UserID:     userID,
	})
	writeJSON(w, http.StatusOK, map[string]string{"message": "assignee removed"})
}

func (h *CollaborationHandler) ListTaskComments(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	taskID := chi.URLParam(r, "taskId")
	if _, ok := ensureTaskAccess(w, r, h.repo, taskID, userID); !ok {
		return
	}
	comments, err := h.repo.ListTaskComments(r.Context(), taskID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list task comments")
		return
	}
	writeJSON(w, http.StatusOK, models.ListResponse[models.TaskComment]{Total: len(comments), Documents: comments})
}

func (h *CollaborationHandler) CreateTaskComment(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	taskID := chi.URLParam(r, "taskId")
	task, ok := ensureTaskAccess(w, r, h.repo, taskID, userID)
	if !ok {
		return
	}
	var req models.CreateTaskCommentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if strings.TrimSpace(req.Body) == "" {
		writeError(w, http.StatusBadRequest, "comment body is required")
		return
	}
	seenMentions := make(map[string]struct{}, len(req.MentionedUserIDs))
	for _, mentionedUserID := range req.MentionedUserIDs {
		if mentionedUserID == "" {
			writeError(w, http.StatusBadRequest, "mentioned user is required")
			return
		}
		if _, seen := seenMentions[mentionedUserID]; seen {
			continue
		}
		seenMentions[mentionedUserID] = struct{}{}
		member, err := h.repo.IsProjectMember(r.Context(), task.ProjectID, mentionedUserID)
		if err != nil || !member {
			writeError(w, http.StatusBadRequest, "mentioned users must be project members")
			return
		}
	}
	comment, err := h.repo.CreateTaskComment(r.Context(), taskID, userID, req)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create task comment")
		return
	}
	h.broadcastProject(task.ProjectID, models.WSEvent{Type: "create", Collection: "task_comments", Document: comment, UserID: userID})
	for mentionedUserID := range seenMentions {
		notification, err := h.repo.CreateNotification(r.Context(), mentionedUserID, userID, "mention", task.ProjectID, task.ID, &comment.ID)
		if err != nil {
			log.Printf("create mention notification error: %v", err)
			continue
		}
		if notification != nil {
			h.hub.Broadcast(mentionedUserID, models.WSEvent{Type: "create", Collection: "notifications", Document: notification, UserID: userID})
		}
	}
	writeJSON(w, http.StatusCreated, comment)
}

func (h *CollaborationHandler) DeleteTaskComment(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	taskID := chi.URLParam(r, "taskId")
	commentID := chi.URLParam(r, "commentId")
	task, ok := ensureTaskAccess(w, r, h.repo, taskID, userID)
	if !ok {
		return
	}
	if err := h.repo.DeleteTaskComment(r.Context(), commentID, userID); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to delete task comment")
		return
	}
	h.broadcastProject(task.ProjectID, models.WSEvent{
		Type:       "delete",
		Collection: "task_comments",
		Document:   map[string]string{"taskId": taskID, "id": commentID},
		UserID:     userID,
	})
	writeJSON(w, http.StatusOK, map[string]string{"message": "comment deleted"})
}

func (h *CollaborationHandler) ListTaskActivity(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	taskID := chi.URLParam(r, "taskId")
	if _, ok := ensureTaskAccess(w, r, h.repo, taskID, userID); !ok {
		return
	}
	activity, err := h.repo.ListTaskActivity(r.Context(), taskID, 50)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list task activity")
		return
	}
	writeJSON(w, http.StatusOK, models.ListResponse[models.ActivityLog]{Total: len(activity), Documents: activity})
}

func (h *CollaborationHandler) HeartbeatProjectPresence(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	projectID := chi.URLParam(r, "projectId")
	if !ensureProjectAccess(w, r, h.repo, projectID, userID) {
		return
	}
	if err := h.repo.UpsertProjectPresence(r.Context(), projectID, userID); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update project presence")
		return
	}
	presence, err := h.repo.ListProjectPresence(r.Context(), projectID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list project presence")
		return
	}
	h.broadcastProject(projectID, models.WSEvent{Type: "update", Collection: "project_presence", Document: presence, UserID: userID})
	writeJSON(w, http.StatusOK, models.ListResponse[models.PresenceSession]{Total: len(presence), Documents: presence})
}

func (h *CollaborationHandler) HeartbeatTaskPresence(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	taskID := chi.URLParam(r, "taskId")
	task, ok := ensureTaskAccess(w, r, h.repo, taskID, userID)
	if !ok {
		return
	}
	if err := h.repo.UpsertTaskPresence(r.Context(), taskID, userID); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update task presence")
		return
	}
	presence, err := h.repo.ListTaskPresence(r.Context(), taskID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list task presence")
		return
	}
	h.broadcastProject(task.ProjectID, models.WSEvent{
		Type:       "update",
		Collection: "task_presence",
		Document:   map[string]interface{}{"taskId": taskID, "sessions": presence},
		UserID:     userID,
	})
	writeJSON(w, http.StatusOK, models.ListResponse[models.PresenceSession]{Total: len(presence), Documents: presence})
}

func (h *CollaborationHandler) DownloadProjectFile(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	fileID := chi.URLParam(r, "fileId")
	projectFile, err := h.repo.GetProjectFile(r.Context(), fileID, userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load file")
		return
	}
	if projectFile == nil {
		writeError(w, http.StatusNotFound, "file not found")
		return
	}
	reader, err := h.fileStore.Open(projectFile.StoragePath)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to open file")
		return
	}
	defer reader.Close()

	w.Header().Set("Content-Type", projectFile.ContentType)
	w.Header().Set("Content-Length", strconv.FormatInt(projectFile.SizeBytes, 10))
	io.Copy(w, reader)
}

func (h *CollaborationHandler) DeleteProjectFile(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	fileID := chi.URLParam(r, "fileId")
	projectFile, err := h.repo.GetProjectFile(r.Context(), fileID, userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load file")
		return
	}
	if projectFile == nil {
		writeError(w, http.StatusNotFound, "file not found")
		return
	}
	if !ensureProjectRole(w, r, h.repo, projectFile.ProjectID, userID, "owner", "admin", "editor") {
		return
	}

	if err := h.repo.DeleteProjectFile(r.Context(), fileID); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to delete file metadata")
		return
	}
	if err := h.fileStore.Delete(projectFile.StoragePath); err != nil {
		log.Printf("DeleteProjectFile storage cleanup error: %v", err)
	}

	if _, err := h.repo.LogActivity(r.Context(), userID, "delete", "File", projectFile.EncryptedName, &projectFile.ProjectID, projectFile.TaskID, nil); err == nil {
		h.broadcastProjectActivity(projectFile.ProjectID, userID)
	}
	h.broadcastProject(projectFile.ProjectID, models.WSEvent{
		Type:       "delete",
		Collection: "project_files",
		Document: map[string]interface{}{
			"id":        fileID,
			"projectId": projectFile.ProjectID,
			"taskId":    projectFile.TaskID,
		},
		UserID: userID,
	})
	writeJSON(w, http.StatusOK, map[string]string{"message": "file deleted"})
}

func (h *CollaborationHandler) ListProjectActivity(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	projectID := chi.URLParam(r, "projectId")
	if !ensureProjectAccess(w, r, h.repo, projectID, userID) {
		return
	}
	activity, err := h.repo.ListProjectActivity(r.Context(), projectID, 25)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list project activity")
		return
	}
	writeJSON(w, http.StatusOK, models.ListResponse[models.ActivityLog]{Total: len(activity), Documents: activity})
}

const maxCollaborationPayloadBytes = 256 * 1024

func collaborationPayloadTooLarge(payload string) bool {
	// Base64 has at most 4 bytes for every 3 raw bytes. Reject it before decoding
	// so a single update cannot allocate an unbounded request body in the API.
	return len(payload) > (maxCollaborationPayloadBytes*4)/3+4
}

func (h *CollaborationHandler) GetTaskDescriptionCollaboration(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	task, ok := ensureTaskAccess(w, r, h.repo, chi.URLParam(r, "taskId"), userID)
	if !ok {
		return
	}
	document, err := h.repo.GetTaskCollaborationDocument(r.Context(), task.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load collaborative description")
		return
	}
	if document == nil {
		writeJSON(w, http.StatusOK, models.CollaborationSyncResponse{Updates: []models.CollaborationUpdate{}})
		return
	}
	updates, err := h.repo.ListCollaborationUpdates(r.Context(), document.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load collaborative updates")
		return
	}
	writeJSON(w, http.StatusOK, models.CollaborationSyncResponse{Document: document, Updates: updates})
}

func (h *CollaborationHandler) InitializeTaskDescriptionCollaboration(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	task, ok := ensureTaskAccess(w, r, h.repo, chi.URLParam(r, "taskId"), userID)
	if !ok || !ensureProjectRole(w, r, h.repo, task.ProjectID, userID, "owner", "admin", "editor") {
		return
	}
	var req models.InitializeCollaborationDocumentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.ClientUpdateID == "" || req.Payload == "" || collaborationPayloadTooLarge(req.Payload) {
		writeError(w, http.StatusBadRequest, "valid collaboration payload and client update id are required")
		return
	}
	if req.IsEncrypted != task.IsEncrypted {
		writeError(w, http.StatusConflict, "collaboration encryption does not match task")
		return
	}
	document, created, err := h.repo.InitializeTaskCollaborationDocument(r.Context(), task.ID, task.ProjectID, userID, req)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to initialize collaborative description")
		return
	}
	updates, err := h.repo.ListCollaborationUpdates(r.Context(), document.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load collaborative updates")
		return
	}
	response := models.CollaborationSyncResponse{Document: document, Updates: updates}
	if created && len(updates) > 0 {
		h.broadcastProject(task.ProjectID, models.WSEvent{Type: "update", Collection: "collaboration_updates", Document: map[string]interface{}{"document": document, "update": updates[0]}, UserID: userID})
	}
	writeJSON(w, http.StatusOK, response)
}

func (h *CollaborationHandler) CreateCollaborationUpdate(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	document, err := h.repo.GetCollaborationDocument(r.Context(), chi.URLParam(r, "documentId"))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load collaborative document")
		return
	}
	if document == nil {
		writeError(w, http.StatusNotFound, "collaborative document not found")
		return
	}
	if !ensureProjectRole(w, r, h.repo, document.ProjectID, userID, "owner", "admin", "editor") {
		return
	}
	var req models.CreateCollaborationUpdateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.ClientUpdateID == "" || req.Payload == "" || collaborationPayloadTooLarge(req.Payload) {
		writeError(w, http.StatusBadRequest, "valid collaboration payload and client update id are required")
		return
	}
	update, err := h.repo.CreateCollaborationUpdate(r.Context(), document.ID, userID, req)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to save collaborative update")
		return
	}
	h.broadcastProject(document.ProjectID, models.WSEvent{Type: "update", Collection: "collaboration_updates", Document: map[string]interface{}{"document": document, "update": update}, UserID: userID})
	writeJSON(w, http.StatusCreated, update)
}

func (h *CollaborationHandler) BroadcastCollaborationAwareness(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	document, err := h.repo.GetCollaborationDocument(r.Context(), chi.URLParam(r, "documentId"))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load collaborative document")
		return
	}
	if document == nil {
		writeError(w, http.StatusNotFound, "collaborative document not found")
		return
	}
	if !ensureProjectAccess(w, r, h.repo, document.ProjectID, userID) {
		return
	}
	var req struct {
		State json.RawMessage `json:"state"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || len(req.State) == 0 || len(req.State) > 8192 {
		writeError(w, http.StatusBadRequest, "valid collaboration awareness state is required")
		return
	}
	h.broadcastProject(document.ProjectID, models.WSEvent{Type: "update", Collection: "collaboration_awareness", Document: map[string]interface{}{"documentId": document.ID, "state": json.RawMessage(req.State)}, UserID: userID})
	w.WriteHeader(http.StatusNoContent)
}

func (h *CollaborationHandler) broadcastProject(projectID string, event models.WSEvent) {
	memberIDs, err := h.repo.ListProjectMemberUserIDs(context.Background(), projectID)
	if err != nil {
		log.Printf("broadcast project members error: %v", err)
		return
	}
	h.hub.BroadcastUsers(memberIDs, event)
}

func (h *CollaborationHandler) broadcastProjectActivity(projectID, actorUserID string) {
	activity, err := h.repo.ListProjectActivity(context.Background(), projectID, 25)
	if err != nil {
		log.Printf("broadcast project activity error: %v", err)
		return
	}
	h.broadcastProject(projectID, models.WSEvent{Type: "update", Collection: "project_activity", Document: activity, UserID: actorUserID})
}

func (h *CollaborationHandler) broadcastTaskActivity(projectID, taskID, actorUserID string) {
	activity, err := h.repo.ListTaskActivity(context.Background(), taskID, 50)
	if err != nil {
		log.Printf("broadcast task activity error: %v", err)
		return
	}
	h.broadcastProject(projectID, models.WSEvent{
		Type:       "update",
		Collection: "task_activity",
		Document:   map[string]interface{}{"taskId": taskID, "activity": activity},
		UserID:     actorUserID,
	})
}

func hashInvitationToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func randomToken() (string, error) {
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}

func limitFileReader(file multipart.File, size int64) io.Reader {
	if size <= 0 {
		return file
	}
	return io.LimitReader(file, size)
}
