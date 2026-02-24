package models

import (
	"encoding/json"
	"time"
)

type User struct {
	ID           string          `json:"id"`
	Email        string          `json:"email"`
	Name         string          `json:"name"`
	PasswordHash string          `json:"-"`
	Preferences  json.RawMessage `json:"preferences"`
	CreatedAt    time.Time       `json:"createdAt"`
	UpdatedAt    time.Time       `json:"updatedAt"`
}

type Project struct {
	ID            string    `json:"id"`
	UserID        string    `json:"userId"`
	Name          string    `json:"name"`
	Description   string    `json:"description"`
	Status        string    `json:"status"`
	DaysPerWeek   *float64  `json:"daysPerWeek"`
	AllocatedDays *int      `json:"allocatedDays"`
	IsEncrypted   bool      `json:"isEncrypted"`
	CreatedAt     time.Time `json:"createdAt"`
	UpdatedAt     time.Time `json:"updatedAt"`
}

type Task struct {
	ID             string          `json:"id"`
	UserID         string          `json:"userId"`
	ProjectID      string          `json:"projectId"`
	Title          string          `json:"title"`
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
	Notes          json.RawMessage `json:"notes"`
	IsEncrypted    bool            `json:"isEncrypted"`
	CreatedAt      time.Time       `json:"createdAt"`
	UpdatedAt      time.Time       `json:"updatedAt"`
}

type WikiGuide struct {
	ID            string               `json:"id"`
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
	Type       string    `json:"type"`
	EntityType string    `json:"entityType"`
	EntityName string    `json:"entityName"`
	ProjectID  *string   `json:"projectId"`
	Metadata   *string   `json:"metadata"`
	CreatedAt  time.Time `json:"createdAt"`
}

type Snippet struct {
	ID          string    `json:"id"`
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

type CreateProjectRequest struct {
	Name          string   `json:"name"`
	Description   string   `json:"description"`
	Status        string   `json:"status"`
	DaysPerWeek   *float64 `json:"daysPerWeek"`
	AllocatedDays *int     `json:"allocatedDays"`
	IsEncrypted   bool     `json:"isEncrypted"`
}

type UpdateProjectRequest struct {
	Name          *string  `json:"name,omitempty"`
	Description   *string  `json:"description,omitempty"`
	Status        *string  `json:"status,omitempty"`
	DaysPerWeek   *float64 `json:"daysPerWeek,omitempty"`
	AllocatedDays *int     `json:"allocatedDays,omitempty"`
	IsEncrypted   *bool    `json:"isEncrypted,omitempty"`
}

type CreateTaskRequest struct {
	ProjectID    string  `json:"projectId"`
	Title        string  `json:"title"`
	Order        int     `json:"order"`
	IsEncrypted  bool    `json:"isEncrypted"`
	ParentID     *string `json:"parentId,omitempty"`
	KanbanStatus string  `json:"kanbanStatus"`
}

type CreateTasksBatchRequest struct {
	ProjectID   string   `json:"projectId"`
	Titles      []string `json:"titles"`
	IsEncrypted bool     `json:"isEncrypted"`
}

type UpdateTaskRequest struct {
	Title          *string          `json:"title,omitempty"`
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
	Notes          *json.RawMessage `json:"notes,omitempty"`
	IsEncrypted    *bool            `json:"isEncrypted,omitempty"`
	WorkDuration   *string          `json:"workDuration,omitempty"`
}

type CreateGuideRequest struct {
	Title       string `json:"title"`
	Description string `json:"description"`
	IsEncrypted bool   `json:"isEncrypted"`
}

type UpdateGuideRequest struct {
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
	Title       string   `json:"title"`
	Content     string   `json:"content"`
	Blocks      *string  `json:"blocks,omitempty"`
	Language    string   `json:"language"`
	Tags        []string `json:"tags,omitempty"`
	Description *string  `json:"description,omitempty"`
	IsEncrypted bool     `json:"isEncrypted"`
}

type UpdateSnippetRequest struct {
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
