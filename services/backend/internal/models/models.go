package models

import (
	"encoding/json"
	"time"
)

type User struct {
	ID              string          `json:"id"`
	Email           string          `json:"email"`
	Name            string          `json:"name"`
	PasswordHash    string          `json:"-"`
	IsPlatformAdmin bool            `json:"isPlatformAdmin"`
	IsActive        bool            `json:"isActive"`
	SessionVersion  int64           `json:"-"`
	Preferences     json.RawMessage `json:"preferences"`
	CreatedAt       time.Time       `json:"createdAt"`
	UpdatedAt       time.Time       `json:"updatedAt"`
}

type PlatformSettings struct {
	LocalAuthEnabled   bool       `json:"localAuthEnabled"`
	BrandName          string     `json:"brandName"`
	BrandLogoKey       *string    `json:"-"`
	BrandLogoUpdatedAt *time.Time `json:"-"`
}

type PlatformBranding struct {
	Name        string `json:"name"`
	LogoPath    string `json:"logoPath,omitempty"`
	LogoVersion string `json:"logoVersion,omitempty"`
}

type AdminOverview struct {
	DatabaseStatus       string `json:"databaseStatus"`
	TotalUsers           int    `json:"totalUsers"`
	ActiveUsers          int    `json:"activeUsers"`
	InactiveUsers        int    `json:"inactiveUsers"`
	PlatformAdmins       int    `json:"platformAdmins"`
	Projects             int    `json:"projects"`
	Tasks                int    `json:"tasks"`
	EnabledOIDCProviders int    `json:"enabledOidcProviders"`
	TotalOIDCProviders   int    `json:"totalOidcProviders"`
	LocalAuthEnabled     bool   `json:"localAuthEnabled"`
}

type AdminAuditEvent struct {
	ID          string          `json:"id"`
	ActorUserID *string         `json:"actorUserId,omitempty"`
	ActorName   string          `json:"actorName"`
	ActorEmail  string          `json:"actorEmail"`
	Action      string          `json:"action"`
	TargetType  string          `json:"targetType"`
	TargetID    *string         `json:"targetId,omitempty"`
	TargetLabel string          `json:"targetLabel"`
	Metadata    json.RawMessage `json:"metadata"`
	CreatedAt   time.Time       `json:"createdAt"`
}

type OIDCProvider struct {
	ID           string    `json:"id"`
	Slug         string    `json:"slug"`
	Name         string    `json:"name"`
	IssuerURL    string    `json:"issuerUrl"`
	ClientID     string    `json:"clientId"`
	HasSecret    bool      `json:"hasSecret"`
	ClientSecret string    `json:"-"`
	Enabled      bool      `json:"enabled"`
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

type OIDCIdentity struct {
	ID           string    `json:"id"`
	UserID       string    `json:"-"`
	ProviderID   string    `json:"providerId"`
	ProviderName string    `json:"providerName"`
	ProviderSlug string    `json:"providerSlug"`
	Subject      string    `json:"-"`
	CreatedAt    time.Time `json:"createdAt"`
}

type AdminUser struct {
	ID              string    `json:"id"`
	Email           string    `json:"email"`
	Name            string    `json:"name"`
	IsPlatformAdmin bool      `json:"isPlatformAdmin"`
	IsActive        bool      `json:"isActive"`
	CreatedAt       time.Time `json:"createdAt"`
	UpdatedAt       time.Time `json:"updatedAt"`
}

type Project struct {
	ID                  string    `json:"id"`
	WorkspaceID         string    `json:"workspaceId"`
	UserID              string    `json:"userId"`
	Name                string    `json:"name"`
	Description         string    `json:"description"`
	Status              string    `json:"status"`
	TaskKeyPrefix       string    `json:"taskKeyPrefix"`
	TaskKeyPrefixLocked bool      `json:"taskKeyPrefixLocked"`
	DaysPerWeek         *float64  `json:"daysPerWeek"`
	AllocatedDays       *int      `json:"allocatedDays"`
	IsEncrypted         bool      `json:"isEncrypted"`
	Role                *string   `json:"role,omitempty"`
	CreatedAt           time.Time `json:"createdAt"`
	UpdatedAt           time.Time `json:"updatedAt"`
}

type ProjectMember struct {
	ID        string    `json:"id"`
	ProjectID string    `json:"projectId"`
	UserID    string    `json:"userId"`
	Email     string    `json:"email"`
	Name      string    `json:"name"`
	Role      string    `json:"role"`
	JoinedAt  time.Time `json:"joinedAt"`
}

type TeamInvitation struct {
	ID            string     `json:"id"`
	ProjectID     string     `json:"projectId"`
	Email         string     `json:"email"`
	Role          string     `json:"role"`
	WorkspaceRole string     `json:"workspaceRole"`
	Token         *string    `json:"token,omitempty"`
	Status        string     `json:"status"`
	InvitedUserID *string    `json:"invitedUserId,omitempty"`
	InvitedByID   string     `json:"invitedById"`
	ExpiresAt     time.Time  `json:"expiresAt"`
	AcceptedAt    *time.Time `json:"acceptedAt,omitempty"`
	CreatedAt     time.Time  `json:"createdAt"`
}

type ProjectFile struct {
	ID            string    `json:"id"`
	ProjectID     string    `json:"projectId"`
	TaskID        *string   `json:"taskId,omitempty"`
	UploaderID    string    `json:"uploaderId"`
	EncryptedName string    `json:"encryptedName"`
	ContentType   string    `json:"contentType"`
	IV            *string   `json:"iv,omitempty"`
	SizeBytes     int64     `json:"sizeBytes"`
	StoragePath   string    `json:"storagePath"`
	IsEncrypted   bool      `json:"isEncrypted"`
	CreatedAt     time.Time `json:"createdAt"`
	UploaderName  *string   `json:"uploaderName,omitempty"`
	DownloadURL   *string   `json:"downloadUrl,omitempty"`
}

type Task struct {
	ID             string          `json:"id"`
	UserID         string          `json:"userId"`
	ProjectID      string          `json:"projectId"`
	TaskNumber     *int            `json:"taskNumber,omitempty"`
	TaskKey        string          `json:"taskKey"`
	Title          string          `json:"title"`
	Description    string          `json:"description"`
	Completed      bool            `json:"completed"`
	ParentID       *string         `json:"parentId"`
	TimeSpent      int             `json:"timeSpent"`
	IsTimerRunning bool            `json:"isTimerRunning"`
	TimerStartedAt *time.Time      `json:"timerStartedAt"`
	TimeEntries    json.RawMessage `json:"timeEntries"`
	Order          int             `json:"order"`
	Priority       string          `json:"priority"`
	KanbanStatus   string          `json:"kanbanStatus"`
	Deadline       *time.Time      `json:"deadline"`
	Tags           []string        `json:"tags"`
	Dependencies   []string        `json:"dependencies"`
	Recurrence     *string         `json:"recurrence"`
	IsEncrypted    bool            `json:"isEncrypted"`
	CreatedAt      time.Time       `json:"createdAt"`
	UpdatedAt      time.Time       `json:"updatedAt"`
}

type ProjectTaskStatus struct {
	ID               string    `json:"id"`
	ProjectID        string    `json:"projectId"`
	Key              string    `json:"key"`
	Label            string    `json:"label"`
	ColorToken       string    `json:"colorToken"`
	Position         int       `json:"position"`
	IsCompletedState bool      `json:"isCompletedState"`
	IsBuiltin        bool      `json:"isBuiltin"`
	CreatedAt        time.Time `json:"createdAt"`
	UpdatedAt        time.Time `json:"updatedAt"`
}

type ProjectMilestone struct {
	ID          string     `json:"id"`
	ProjectID   string     `json:"projectId"`
	CreatedBy   string     `json:"createdBy"`
	Title       string     `json:"title"`
	Description string     `json:"description"`
	Status      string     `json:"status"`
	DueDate     *time.Time `json:"dueDate,omitempty"`
	Position    int        `json:"position"`
	CreatedAt   time.Time  `json:"createdAt"`
	UpdatedAt   time.Time  `json:"updatedAt"`
}

type TaskAssignee struct {
	TaskID     string    `json:"taskId"`
	UserID     string    `json:"userId"`
	Name       string    `json:"name"`
	Email      string    `json:"email"`
	AssignedBy string    `json:"assignedBy"`
	CreatedAt  time.Time `json:"createdAt"`
}

type TaskComment struct {
	ID               string    `json:"id"`
	TaskID           string    `json:"taskId"`
	UserID           string    `json:"userId"`
	UserName         string    `json:"userName"`
	UserEmail        string    `json:"userEmail"`
	Body             string    `json:"body"`
	MentionedUserIDs []string  `json:"mentionedUserIds"`
	IsEncrypted      bool      `json:"isEncrypted"`
	CreatedAt        time.Time `json:"createdAt"`
	UpdatedAt        time.Time `json:"updatedAt"`
}

type PresenceSession struct {
	UserID   string    `json:"userId"`
	Name     string    `json:"name"`
	Email    string    `json:"email"`
	LastSeen time.Time `json:"lastSeen"`
}

type RecurrenceRule struct {
	Type     string `json:"type"`
	Interval int    `json:"interval"`
}

type WikiGuide struct {
	ID            string               `json:"id"`
	WorkspaceID   string               `json:"workspaceId"`
	ProjectID     *string              `json:"projectId,omitempty"`
	ParentID      *string              `json:"parentId,omitempty"`
	UserID        string               `json:"userId"`
	Title         string               `json:"title"`
	Description   string               `json:"description"`
	IsEncrypted   bool                 `json:"isEncrypted"`
	CreatedAt     time.Time            `json:"createdAt"`
	UpdatedAt     time.Time            `json:"updatedAt"`
	Installations []InstallationTarget `json:"installations,omitempty"`
}

type InstallationTarget struct {
	ID            string          `json:"id"`
	UserID        string          `json:"userId"`
	GuideID       string          `json:"guideId"`
	Target        string          `json:"target"`
	GitRepo       *string         `json:"gitRepo"`
	Documentation *string         `json:"documentation"`
	Notes         *string         `json:"notes"`
	Tasks         json.RawMessage `json:"tasks"`
	IsEncrypted   bool            `json:"isEncrypted"`
	IV            *string         `json:"iv"`
	CreatedAt     time.Time       `json:"createdAt"`
	UpdatedAt     time.Time       `json:"updatedAt"`
}

type ActivityLog struct {
	ID         string    `json:"id"`
	UserID     string    `json:"userId"`
	UserName   *string   `json:"userName,omitempty"`
	Type       string    `json:"type"`
	EntityType string    `json:"entityType"`
	EntityName string    `json:"entityName"`
	ProjectID  *string   `json:"projectId"`
	TaskID     *string   `json:"taskId,omitempty"`
	Metadata   *string   `json:"metadata"`
	CreatedAt  time.Time `json:"createdAt"`
}

type Notification struct {
	ID              string     `json:"id"`
	RecipientUserID string     `json:"recipientUserId"`
	ActorUserID     string     `json:"actorUserId"`
	ActorName       string     `json:"actorName"`
	Type            string     `json:"type"`
	ProjectID       string     `json:"projectId"`
	ProjectName     string     `json:"projectName"`
	TaskID          string     `json:"taskId"`
	TaskKey         string     `json:"taskKey"`
	TaskTitle       string     `json:"taskTitle"`
	CommentID       *string    `json:"commentId,omitempty"`
	DeadlineAt      *time.Time `json:"deadlineAt,omitempty"`
	ReadAt          *time.Time `json:"readAt,omitempty"`
	CreatedAt       time.Time  `json:"createdAt"`
}

type Snippet struct {
	ID          string    `json:"id"`
	WorkspaceID string    `json:"workspaceId"`
	ProjectID   *string   `json:"projectId,omitempty"`
	Collection  *string   `json:"collection,omitempty"`
	UserID      string    `json:"userId"`
	Title       string    `json:"title"`
	Content     string    `json:"content"`
	Blocks      *string   `json:"blocks"`
	Language    string    `json:"language"`
	Tags        []string  `json:"tags"`
	Description *string   `json:"description"`
	IsEncrypted bool      `json:"isEncrypted"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

type Workspace struct {
	ID                       string    `json:"id"`
	OwnerID                  string    `json:"ownerId"`
	Name                     string    `json:"name"`
	Slug                     string    `json:"slug"`
	Role                     string    `json:"role"`
	AutoAddMembersToProjects bool      `json:"autoAddMembersToProjects"`
	CreatedAt                time.Time `json:"createdAt"`
	UpdatedAt                time.Time `json:"updatedAt"`
}

type WorkspaceMember struct {
	WorkspaceID string    `json:"workspaceId"`
	UserID      string    `json:"userId"`
	Name        string    `json:"name"`
	Email       string    `json:"email"`
	Role        string    `json:"role"`
	JoinedAt    time.Time `json:"joinedAt"`
	PublicKey   *string   `json:"publicKey,omitempty"`
	HasVault    bool      `json:"hasVault"`
}

type WorkspaceInvitation struct {
	ID            string     `json:"id"`
	WorkspaceID   string     `json:"workspaceId"`
	Email         string     `json:"email"`
	Role          string     `json:"role"`
	Token         *string    `json:"token,omitempty"`
	Status        string     `json:"status"`
	InvitedUserID *string    `json:"invitedUserId,omitempty"`
	InvitedByID   string     `json:"invitedById"`
	ExpiresAt     time.Time  `json:"expiresAt"`
	AcceptedAt    *time.Time `json:"acceptedAt,omitempty"`
	CreatedAt     time.Time  `json:"createdAt"`
}

type UserKeys struct {
	ID                  string    `json:"id"`
	UserID              string    `json:"userId"`
	Email               *string   `json:"email"`
	PublicKey           string    `json:"publicKey"`
	EncryptedPrivateKey string    `json:"encryptedPrivateKey"`
	Salt                string    `json:"salt"`
	IV                  string    `json:"iv"`
	CreatedAt           time.Time `json:"createdAt"`
	UpdatedAt           time.Time `json:"updatedAt"`
}

type UserLookup struct {
	UserID    string  `json:"userId"`
	Email     string  `json:"email"`
	Name      string  `json:"name"`
	PublicKey *string `json:"publicKey,omitempty"`
	HasVault  bool    `json:"hasVault"`
}

type AccessControl struct {
	ID           string    `json:"id"`
	ResourceID   string    `json:"resourceId"`
	UserID       string    `json:"userId"`
	EncryptedKey string    `json:"encryptedKey"`
	ResourceType string    `json:"resourceType"`
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

type ResourceVersion struct {
	ID           string    `json:"id"`
	UserID       string    `json:"userId"`
	ResourceID   string    `json:"resourceId"`
	ResourceType string    `json:"resourceType"`
	Content      string    `json:"content"`
	Title        *string   `json:"title"`
	Metadata     *string   `json:"metadata"`
	IsEncrypted  bool      `json:"isEncrypted"`
	CreatedAt    time.Time `json:"createdAt"`
}

// --- Request/Response DTOs ---

type SignupRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
	Name     string `json:"name"`
}

type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type AuthResponse struct {
	Token string `json:"token"`
	User  User   `json:"user"`
}

type UpdateProfileRequest struct {
	Name        *string          `json:"name,omitempty"`
	Preferences *json.RawMessage `json:"preferences,omitempty"`
}

type AdminUserUpdateRequest struct {
	IsPlatformAdmin *bool `json:"isPlatformAdmin,omitempty"`
	IsActive        *bool `json:"isActive,omitempty"`
}

type PlatformSettingsUpdateRequest struct {
	LocalAuthEnabled *bool   `json:"localAuthEnabled,omitempty"`
	BrandName        *string `json:"brandName,omitempty"`
}

type CreateWorkspaceRequest struct {
	Name string `json:"name"`
}

type UpdateWorkspaceRequest struct {
	Name                     *string `json:"name,omitempty"`
	AutoAddMembersToProjects *bool   `json:"autoAddMembersToProjects,omitempty"`
}

type CreateWorkspaceMemberRequest struct {
	UserID string `json:"userId"`
	Role   string `json:"role"`
}

type UpdateWorkspaceMemberRequest struct {
	Role string `json:"role"`
}

type CreateWorkspaceInvitationRequest struct {
	Email string `json:"email"`
	Role  string `json:"role"`
}

type OIDCProviderRequest struct {
	Slug         string `json:"slug"`
	Name         string `json:"name"`
	IssuerURL    string `json:"issuerUrl"`
	ClientID     string `json:"clientId"`
	ClientSecret string `json:"clientSecret"`
	Enabled      *bool  `json:"enabled,omitempty"`
}

type CreateProjectRequest struct {
	WorkspaceID   string   `json:"workspaceId,omitempty"`
	Name          string   `json:"name"`
	Description   string   `json:"description"`
	Status        string   `json:"status"`
	TaskKeyPrefix string   `json:"taskKeyPrefix"`
	DaysPerWeek   *float64 `json:"daysPerWeek"`
	AllocatedDays *int     `json:"allocatedDays"`
	IsEncrypted   bool     `json:"isEncrypted"`
}

type UpdateProjectRequest struct {
	Name          *string  `json:"name,omitempty"`
	Description   *string  `json:"description,omitempty"`
	Status        *string  `json:"status,omitempty"`
	TaskKeyPrefix *string  `json:"taskKeyPrefix,omitempty"`
	DaysPerWeek   *float64 `json:"daysPerWeek,omitempty"`
	AllocatedDays *int     `json:"allocatedDays,omitempty"`
	IsEncrypted   *bool    `json:"isEncrypted,omitempty"`
}

type CreateProjectMemberRequest struct {
	ProjectID    string  `json:"projectId"`
	UserID       string  `json:"userId"`
	Role         string  `json:"role"`
	EncryptedKey *string `json:"encryptedKey,omitempty"`
	ResourceType *string `json:"resourceType,omitempty"`
}

type UpdateProjectMemberRequest struct {
	Role string `json:"role"`
}

type CreateInvitationRequest struct {
	ProjectID     string  `json:"projectId"`
	Email         string  `json:"email"`
	Role          string  `json:"role"`
	WorkspaceRole string  `json:"workspaceRole,omitempty"`
	EncryptedKey  *string `json:"encryptedKey,omitempty"`
}

type AcceptInvitationRequest struct {
	Token string `json:"token"`
}

type CreateProjectFileRequest struct {
	ProjectID     string `json:"projectId"`
	TaskID        string `json:"taskId"`
	EncryptedName string `json:"encryptedName"`
	ContentType   string `json:"contentType"`
	IV            string `json:"iv"`
	IsEncrypted   bool   `json:"isEncrypted"`
}

type CreateTaskRequest struct {
	ProjectID    string   `json:"projectId"`
	Title        string   `json:"title"`
	Description  string   `json:"description"`
	Order        int      `json:"order"`
	IsEncrypted  bool     `json:"isEncrypted"`
	ParentID     *string  `json:"parentId,omitempty"`
	KanbanStatus string   `json:"kanbanStatus"`
	Tags         []string `json:"tags,omitempty"`
	Dependencies []string `json:"dependencies,omitempty"`
	Recurrence   *string  `json:"recurrence,omitempty"`
}

type CreateTasksBatchRequest struct {
	ProjectID   string   `json:"projectId"`
	Titles      []string `json:"titles"`
	IsEncrypted bool     `json:"isEncrypted"`
}

type UpdateTaskRequest struct {
	Title          *string          `json:"title,omitempty"`
	Description    *string          `json:"description,omitempty"`
	Completed      *bool            `json:"completed,omitempty"`
	ParentID       *string          `json:"parentId,omitempty"`
	TimeSpent      *int             `json:"timeSpent,omitempty"`
	IsTimerRunning *bool            `json:"isTimerRunning,omitempty"`
	TimerStartedAt *string          `json:"timerStartedAt,omitempty"`
	TimeEntries    *json.RawMessage `json:"timeEntries,omitempty"`
	Order          *int             `json:"order,omitempty"`
	Priority       *string          `json:"priority,omitempty"`
	KanbanStatus   *string          `json:"kanbanStatus,omitempty"`
	Deadline       *string          `json:"deadline,omitempty"`
	Tags           []string         `json:"tags,omitempty"`
	Dependencies   []string         `json:"dependencies,omitempty"`
	Recurrence     *string          `json:"recurrence,omitempty"`
	IsEncrypted    *bool            `json:"isEncrypted,omitempty"`
	WorkDuration   *string          `json:"workDuration,omitempty"`
}

type CreateProjectTaskStatusRequest struct {
	Label            string `json:"label"`
	ColorToken       string `json:"colorToken"`
	IsCompletedState bool   `json:"isCompletedState"`
}

type CreateProjectMilestoneRequest struct {
	Title       string  `json:"title"`
	Description string  `json:"description,omitempty"`
	DueDate     *string `json:"dueDate,omitempty"`
}

type UpdateProjectMilestoneRequest struct {
	Title       *string `json:"title,omitempty"`
	Description *string `json:"description,omitempty"`
	Status      *string `json:"status,omitempty"`
	DueDate     *string `json:"dueDate,omitempty"`
}

type UpdateProjectTaskStatusRequest struct {
	Label            *string `json:"label,omitempty"`
	ColorToken       *string `json:"colorToken,omitempty"`
	IsCompletedState *bool   `json:"isCompletedState,omitempty"`
}

type ReorderProjectTaskStatusesRequest struct {
	StatusIDs []string `json:"statusIds"`
}

type DeleteProjectTaskStatusRequest struct {
	ReplacementStatusID string `json:"replacementStatusId"`
}

type GetTaskByKeyResponse struct {
	Task *Task `json:"task"`
}

type UpdateTaskRequestWithID struct {
	ID           string  `json:"id"`
	KanbanStatus *string `json:"kanbanStatus,omitempty"`
	Completed    *bool   `json:"completed,omitempty"`
	Order        *int    `json:"order,omitempty"`
}

type ReorderProjectTasksRequest struct {
	Updates []UpdateTaskRequestWithID `json:"updates"`
}

type CreateTaskCommentRequest struct {
	Body             string   `json:"body"`
	MentionedUserIDs []string `json:"mentionedUserIds,omitempty"`
	IsEncrypted      bool     `json:"isEncrypted"`
}

type AssignTaskUserRequest struct {
	UserID string `json:"userId"`
}

type CreateGuideRequest struct {
	WorkspaceID string  `json:"workspaceId,omitempty"`
	ProjectID   *string `json:"projectId,omitempty"`
	ParentID    *string `json:"parentId,omitempty"`
	Title       string  `json:"title"`
	Description string  `json:"description"`
	IsEncrypted bool    `json:"isEncrypted"`
}

type UpdateGuideRequest struct {
	WorkspaceID *string `json:"workspaceId,omitempty"`
	ProjectID   *string `json:"projectId,omitempty"`
	ParentID    *string `json:"parentId,omitempty"`
	Title       *string `json:"title,omitempty"`
	Description *string `json:"description,omitempty"`
	IsEncrypted *bool   `json:"isEncrypted,omitempty"`
}

type CreateInstallationRequest struct {
	GuideID       string   `json:"guideId"`
	Target        string   `json:"target"`
	GitRepo       *string  `json:"gitRepo,omitempty"`
	Documentation *string  `json:"documentation,omitempty"`
	Notes         *string  `json:"notes,omitempty"`
	Tasks         []string `json:"tasks,omitempty"`
	IsEncrypted   bool     `json:"isEncrypted"`
	IV            *string  `json:"iv,omitempty"`
}

type UpdateInstallationRequest struct {
	Target        *string  `json:"target,omitempty"`
	GitRepo       *string  `json:"gitRepo,omitempty"`
	Documentation *string  `json:"documentation,omitempty"`
	Notes         *string  `json:"notes,omitempty"`
	Tasks         []string `json:"tasks,omitempty"`
	IsEncrypted   *bool    `json:"isEncrypted,omitempty"`
	IV            *string  `json:"iv,omitempty"`
}

type CreateSnippetRequest struct {
	WorkspaceID string   `json:"workspaceId,omitempty"`
	ProjectID   *string  `json:"projectId,omitempty"`
	Collection  *string  `json:"collection,omitempty"`
	Title       string   `json:"title"`
	Content     string   `json:"content"`
	Blocks      *string  `json:"blocks,omitempty"`
	Language    string   `json:"language"`
	Tags        []string `json:"tags,omitempty"`
	Description *string  `json:"description,omitempty"`
	IsEncrypted bool     `json:"isEncrypted"`
}

type UpdateSnippetRequest struct {
	WorkspaceID *string  `json:"workspaceId,omitempty"`
	ProjectID   *string  `json:"projectId,omitempty"`
	Collection  *string  `json:"collection,omitempty"`
	Title       *string  `json:"title,omitempty"`
	Content     *string  `json:"content,omitempty"`
	Blocks      *string  `json:"blocks,omitempty"`
	Language    *string  `json:"language,omitempty"`
	Tags        []string `json:"tags,omitempty"`
	Description *string  `json:"description,omitempty"`
	IsEncrypted *bool    `json:"isEncrypted,omitempty"`
}

type CreateUserKeysRequest struct {
	PublicKey           string `json:"publicKey"`
	EncryptedPrivateKey string `json:"encryptedPrivateKey"`
	Salt                string `json:"salt"`
	IV                  string `json:"iv"`
}

type UpdateUserKeysRequest struct {
	Email               *string `json:"email,omitempty"`
	PublicKey           *string `json:"publicKey,omitempty"`
	EncryptedPrivateKey *string `json:"encryptedPrivateKey,omitempty"`
	Salt                *string `json:"salt,omitempty"`
	IV                  *string `json:"iv,omitempty"`
}

type GrantAccessRequest struct {
	ResourceID   string `json:"resourceId"`
	UserID       string `json:"userId"`
	EncryptedKey string `json:"encryptedKey"`
	ResourceType string `json:"resourceType"`
}

type CreateVersionRequest struct {
	ResourceID   string  `json:"resourceId"`
	ResourceType string  `json:"resourceType"`
	Content      string  `json:"content"`
	Title        *string `json:"title,omitempty"`
	Metadata     *string `json:"metadata,omitempty"`
	IsEncrypted  bool    `json:"isEncrypted"`
}

type ListResponse[T any] struct {
	Total     int `json:"total"`
	Documents []T `json:"documents"`
}

type WSEvent struct {
	Type       string      `json:"type"`
	Collection string      `json:"collection"`
	Document   interface{} `json:"document"`
	UserID     string      `json:"userId"`
}
