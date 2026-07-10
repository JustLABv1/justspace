package repository

import (
	"context"
	"encoding/json"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/justlabv1/justspace/backend/internal/models"
)

type Repo struct {
	pool *pgxpool.Pool
}

func New(pool *pgxpool.Pool) *Repo {
	return &Repo{pool: pool}
}

const projectSelect = `SELECT p.id, p.user_id, p.name, p.description, p.status, p.days_per_week, p.allocated_days, p.is_encrypted,
	p.task_key_prefix, (p.next_task_number > 1) AS task_key_prefix_locked, pm.role, p.created_at, p.updated_at
	FROM projects p
	JOIN project_members pm ON pm.project_id = p.id
	WHERE pm.user_id = $1`

const taskSelectColumns = `id, user_id, project_id, task_number, task_key, title, description, completed, parent_id, time_spent, is_timer_running, timer_started_at, time_entries, sort_order, priority, kanban_status, deadline, notes, tags, dependencies, recurrence, is_encrypted, created_at, updated_at`

const taskStatusSelectColumns = `id, project_id, key, label, color_token, position, is_completed_state, is_builtin, created_at, updated_at`

var nonAlphanumeric = regexp.MustCompile(`[^A-Za-z0-9]+`)

func scanProject(row pgx.Row, project *models.Project) error {
	return row.Scan(
		&project.ID,
		&project.UserID,
		&project.Name,
		&project.Description,
		&project.Status,
		&project.DaysPerWeek,
		&project.AllocatedDays,
		&project.IsEncrypted,
		&project.TaskKeyPrefix,
		&project.TaskKeyPrefixLocked,
		&project.Role,
		&project.CreatedAt,
		&project.UpdatedAt,
	)
}

func scanTaskRow(row pgx.Row, task *models.Task) error {
	return row.Scan(
		&task.ID,
		&task.UserID,
		&task.ProjectID,
		&task.TaskNumber,
		&task.TaskKey,
		&task.Title,
		&task.Description,
		&task.Completed,
		&task.ParentID,
		&task.TimeSpent,
		&task.IsTimerRunning,
		&task.TimerStartedAt,
		&task.TimeEntries,
		&task.Order,
		&task.Priority,
		&task.KanbanStatus,
		&task.Deadline,
		&task.Notes,
		&task.Tags,
		&task.Dependencies,
		&task.Recurrence,
		&task.IsEncrypted,
		&task.CreatedAt,
		&task.UpdatedAt,
	)
}

func scanProjectTaskStatusRow(row pgx.Row, status *models.ProjectTaskStatus) error {
	return row.Scan(
		&status.ID,
		&status.ProjectID,
		&status.Key,
		&status.Label,
		&status.ColorToken,
		&status.Position,
		&status.IsCompletedState,
		&status.IsBuiltin,
		&status.CreatedAt,
		&status.UpdatedAt,
	)
}

func normalizeStatusKey(value string) string {
	key := strings.ToLower(strings.TrimSpace(value))
	key = strings.ReplaceAll(key, "&", " and ")
	key = strings.ReplaceAll(key, "/", " ")
	key = nonAlphanumeric.ReplaceAllString(key, "-")
	key = strings.Trim(key, "-")
	if key == "" {
		key = "status"
	}
	return key
}

func normalizeProjectTaskKeyPrefix(value string) string {
	prefix := strings.ToUpper(strings.TrimSpace(value))
	prefix = nonAlphanumeric.ReplaceAllString(prefix, "")
	if prefix == "" {
		prefix = "PRJ"
	}
	if len(prefix) > 8 {
		prefix = prefix[:8]
	}
	return prefix
}

func normalizeStatusColorToken(value string) string {
	switch strings.TrimSpace(value) {
	case "default", "accent", "warning", "danger", "success":
		return strings.TrimSpace(value)
	default:
		return "default"
	}
}

func normalizedProjectKeyPrefixOrNil(value *string) *string {
	if value == nil {
		return nil
	}
	normalized := normalizeProjectTaskKeyPrefix(*value)
	return &normalized
}

func uniqueProjectTaskKeyPrefix(ctx context.Context, tx pgx.Tx, requested, fallbackName string, excludeProjectID *string) (string, error) {
	base := strings.TrimSpace(requested)
	if base == "" {
		base = fallbackName
	}
	base = normalizeProjectTaskKeyPrefix(base)
	candidate := base
	suffix := 1

	for {
		var exists bool
		query := `SELECT EXISTS(SELECT 1 FROM projects WHERE task_key_prefix = $1`
		args := []any{candidate}
		if excludeProjectID != nil {
			query += ` AND id <> $2`
			args = append(args, *excludeProjectID)
		}
		query += `)`
		if err := tx.QueryRow(ctx, query, args...).Scan(&exists); err != nil {
			return "", fmt.Errorf("check project task key prefix uniqueness: %w", err)
		}
		if !exists {
			return candidate, nil
		}
		suffix++
		candidate = base
		suffixText := strconv.Itoa(suffix)
		if len(candidate)+len(suffixText) > 8 {
			candidate = candidate[:8-len(suffixText)]
		}
		candidate += suffixText
	}
}

// ---- Users ----

func (r *Repo) CreateUser(ctx context.Context, email, name, passwordHash string) (*models.User, error) {
	u := &models.User{}
	err := r.pool.QueryRow(ctx,
		`INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3)
		 RETURNING id, email, name, preferences, created_at, updated_at`,
		email, name, passwordHash,
	).Scan(&u.ID, &u.Email, &u.Name, &u.Preferences, &u.CreatedAt, &u.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("create user: %w", err)
	}
	return u, nil
}

func (r *Repo) GetUserByEmail(ctx context.Context, email string) (*models.User, error) {
	u := &models.User{}
	err := r.pool.QueryRow(ctx,
		`SELECT id, email, name, password_hash, preferences, created_at, updated_at FROM users WHERE email = $1`, email,
	).Scan(&u.ID, &u.Email, &u.Name, &u.PasswordHash, &u.Preferences, &u.CreatedAt, &u.UpdatedAt)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("get user by email: %w", err)
	}
	return u, nil
}

func (r *Repo) GetUserByID(ctx context.Context, id string) (*models.User, error) {
	u := &models.User{}
	err := r.pool.QueryRow(ctx,
		`SELECT id, email, name, password_hash, preferences, created_at, updated_at FROM users WHERE id = $1`, id,
	).Scan(&u.ID, &u.Email, &u.Name, &u.PasswordHash, &u.Preferences, &u.CreatedAt, &u.UpdatedAt)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("get user by id: %w", err)
	}
	return u, nil
}

func (r *Repo) SearchUsers(ctx context.Context, query string, limit int) ([]models.UserLookup, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT u.id, u.email, u.name, uk.public_key, uk.user_id IS NOT NULL
		 FROM users u
		 LEFT JOIN user_keys uk ON uk.user_id = u.id
		 WHERE u.email ILIKE '%' || $1 || '%' OR u.name ILIKE '%' || $1 || '%'
		 ORDER BY u.email ASC
		 LIMIT $2`,
		query, limit,
	)
	if err != nil {
		return nil, fmt.Errorf("search users: %w", err)
	}
	defer rows.Close()

	var out []models.UserLookup
	for rows.Next() {
		var item models.UserLookup
		if err := rows.Scan(&item.UserID, &item.Email, &item.Name, &item.PublicKey, &item.HasVault); err != nil {
			return nil, err
		}
		out = append(out, item)
	}
	if out == nil {
		out = []models.UserLookup{}
	}
	return out, nil
}

func (r *Repo) UpdateUser(ctx context.Context, id string, name *string, prefs *json.RawMessage) (*models.User, error) {
	u := &models.User{}
	err := r.pool.QueryRow(ctx,
		`UPDATE users SET name = COALESCE($2, name), preferences = COALESCE($3, preferences)
		 WHERE id = $1 RETURNING id, email, name, preferences, created_at, updated_at`,
		id, name, prefs,
	).Scan(&u.ID, &u.Email, &u.Name, &u.Preferences, &u.CreatedAt, &u.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("update user: %w", err)
	}
	return u, nil
}

func defaultTaskStatusTemplates() []models.ProjectTaskStatus {
	return []models.ProjectTaskStatus{
		{Key: "todo", Label: "Todo", ColorToken: "default", Position: 0, IsCompletedState: false, IsBuiltin: true},
		{Key: "in-progress", Label: "In progress", ColorToken: "accent", Position: 1, IsCompletedState: false, IsBuiltin: true},
		{Key: "review", Label: "Review", ColorToken: "warning", Position: 2, IsCompletedState: false, IsBuiltin: true},
		{Key: "waiting", Label: "Blocked", ColorToken: "danger", Position: 3, IsCompletedState: false, IsBuiltin: true},
		{Key: "done", Label: "Done", ColorToken: "success", Position: 4, IsCompletedState: true, IsBuiltin: true},
	}
}

func (r *Repo) loadWorkspaceTaskStatusTemplates(ctx context.Context, userID string) ([]models.ProjectTaskStatus, error) {
	user, err := r.GetUserByID(ctx, userID)
	if err != nil {
		return nil, err
	}
	if user == nil || len(user.Preferences) == 0 {
		return defaultTaskStatusTemplates(), nil
	}

	var rawPreferences map[string]any
	if err := json.Unmarshal(user.Preferences, &rawPreferences); err != nil {
		return defaultTaskStatusTemplates(), nil
	}

	rawTemplates, ok := rawPreferences["taskStatusTemplates"].([]any)
	if !ok || len(rawTemplates) == 0 {
		return defaultTaskStatusTemplates(), nil
	}

	var templates []models.ProjectTaskStatus
	for idx, raw := range rawTemplates {
		item, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		label, _ := item["label"].(string)
		if strings.TrimSpace(label) == "" {
			continue
		}
		key, _ := item["key"].(string)
		colorToken, _ := item["colorToken"].(string)
		isCompletedState, _ := item["isCompletedState"].(bool)
		isBuiltin, _ := item["isBuiltin"].(bool)
		templates = append(templates, models.ProjectTaskStatus{
			Key:              normalizeStatusKey(key),
			Label:            strings.TrimSpace(label),
			ColorToken:       normalizeStatusColorToken(colorToken),
			Position:         idx,
			IsCompletedState: isCompletedState,
			IsBuiltin:        isBuiltin,
		})
	}

	if len(templates) == 0 {
		return defaultTaskStatusTemplates(), nil
	}

	foundDone := false
	for i := range templates {
		if templates[i].Key == "done" {
			templates[i].IsCompletedState = true
			templates[i].IsBuiltin = true
			foundDone = true
		}
	}
	if !foundDone {
		templates = append(templates, models.ProjectTaskStatus{
			Key:              "done",
			Label:            "Done",
			ColorToken:       "success",
			Position:         len(templates),
			IsCompletedState: true,
			IsBuiltin:        true,
		})
	}

	return templates, nil
}

func seedProjectTaskStatuses(ctx context.Context, tx pgx.Tx, projectID string, templates []models.ProjectTaskStatus) error {
	for idx, template := range templates {
		if _, err := tx.Exec(ctx,
			`INSERT INTO project_task_statuses (project_id, key, label, color_token, position, is_completed_state, is_builtin)
			 VALUES ($1, $2, $3, $4, $5, $6, $7)
			 ON CONFLICT (project_id, key) DO NOTHING`,
			projectID,
			normalizeStatusKey(template.Key),
			strings.TrimSpace(template.Label),
			normalizeStatusColorToken(template.ColorToken),
			idx,
			template.IsCompletedState || normalizeStatusKey(template.Key) == "done",
			template.IsBuiltin,
		); err != nil {
			return fmt.Errorf("seed project task statuses: %w", err)
		}
	}
	return nil
}

// ---- Projects ----

func (r *Repo) ListProjects(ctx context.Context, userID string) ([]models.Project, error) {
	rows, err := r.pool.Query(ctx,
		projectSelect+` ORDER BY p.created_at DESC`, userID)
	if err != nil {
		return nil, fmt.Errorf("list projects: %w", err)
	}
	defer rows.Close()
	var out []models.Project
	for rows.Next() {
		var p models.Project
		if err := rows.Scan(&p.ID, &p.UserID, &p.Name, &p.Description, &p.Status, &p.DaysPerWeek, &p.AllocatedDays, &p.IsEncrypted, &p.TaskKeyPrefix, &p.TaskKeyPrefixLocked, &p.Role, &p.CreatedAt, &p.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	if out == nil {
		out = []models.Project{}
	}
	return out, nil
}

func (r *Repo) GetProject(ctx context.Context, id, userID string) (*models.Project, error) {
	p := &models.Project{}
	err := scanProject(r.pool.QueryRow(ctx, projectSelect+` AND p.id = $2`, userID, id), p)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("get project: %w", err)
	}
	return p, nil
}

func (r *Repo) CreateProject(ctx context.Context, userID string, req models.CreateProjectRequest) (*models.Project, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin create project: %w", err)
	}
	defer tx.Rollback(ctx)

	taskKeyPrefix, err := uniqueProjectTaskKeyPrefix(ctx, tx, req.TaskKeyPrefix, req.Name, nil)
	if err != nil {
		return nil, err
	}

	p := &models.Project{}
	if err := tx.QueryRow(ctx,
		`INSERT INTO projects (user_id, name, description, status, task_key_prefix, days_per_week, allocated_days, is_encrypted)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		 RETURNING id, user_id, name, description, status, task_key_prefix, (next_task_number > 1) AS task_key_prefix_locked, days_per_week, allocated_days, is_encrypted, created_at, updated_at`,
		userID, req.Name, req.Description, req.Status, taskKeyPrefix, req.DaysPerWeek, req.AllocatedDays, req.IsEncrypted,
	).Scan(&p.ID, &p.UserID, &p.Name, &p.Description, &p.Status, &p.TaskKeyPrefix, &p.TaskKeyPrefixLocked, &p.DaysPerWeek, &p.AllocatedDays, &p.IsEncrypted, &p.CreatedAt, &p.UpdatedAt); err != nil {
		return nil, fmt.Errorf("create project: %w", err)
	}

	if _, err := tx.Exec(ctx,
		`INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'owner')
		 ON CONFLICT (project_id, user_id) DO NOTHING`,
		p.ID, userID,
	); err != nil {
		return nil, fmt.Errorf("create project owner membership: %w", err)
	}

	templates, err := r.loadWorkspaceTaskStatusTemplates(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("load workspace task status templates: %w", err)
	}
	if err := seedProjectTaskStatuses(ctx, tx, p.ID, templates); err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit create project: %w", err)
	}

	role := "owner"
	p.Role = &role
	return p, nil
}

func (r *Repo) UpdateProject(ctx context.Context, id, userID string, req models.UpdateProjectRequest) (*models.Project, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin update project: %w", err)
	}
	defer tx.Rollback(ctx)

	var normalizedPrefix *string
	if req.TaskKeyPrefix != nil {
		value, err := uniqueProjectTaskKeyPrefix(ctx, tx, *req.TaskKeyPrefix, *req.TaskKeyPrefix, &id)
		if err != nil {
			return nil, err
		}
		normalizedPrefix = &value
	}

	p := &models.Project{}
	err = tx.QueryRow(ctx,
		`UPDATE projects SET name = COALESCE($3, name), description = COALESCE($4, description), status = COALESCE($5, status),
		 task_key_prefix = CASE
		 	WHEN $6::text IS NOT NULL AND next_task_number <= 1 THEN $6::text
		 	ELSE task_key_prefix
		 END,
		 days_per_week = COALESCE($7, days_per_week), allocated_days = COALESCE($8, allocated_days), is_encrypted = COALESCE($9, is_encrypted)
		 WHERE id = $1 AND EXISTS (
		 	SELECT 1 FROM project_members pm
		 	WHERE pm.project_id = projects.id AND pm.user_id = $2 AND pm.role IN ('owner', 'admin', 'editor')
		 )
		 RETURNING id, user_id, name, description, status, task_key_prefix, (next_task_number > 1) AS task_key_prefix_locked, days_per_week, allocated_days, is_encrypted, created_at, updated_at`,
		id, userID, req.Name, req.Description, req.Status, normalizedPrefix, req.DaysPerWeek, req.AllocatedDays, req.IsEncrypted,
	).Scan(&p.ID, &p.UserID, &p.Name, &p.Description, &p.Status, &p.TaskKeyPrefix, &p.TaskKeyPrefixLocked, &p.DaysPerWeek, &p.AllocatedDays, &p.IsEncrypted, &p.CreatedAt, &p.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("update project: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit update project: %w", err)
	}
	role := "editor"
	if memberRole, roleErr := r.GetProjectRole(ctx, id, userID); roleErr == nil && memberRole != "" {
		role = memberRole
	}
	p.Role = &role
	return p, nil
}

func (r *Repo) DeleteProject(ctx context.Context, id, userID string) error {
	_, err := r.pool.Exec(ctx,
		`DELETE FROM projects WHERE id = $1 AND EXISTS (
			SELECT 1 FROM project_members pm
			WHERE pm.project_id = projects.id AND pm.user_id = $2 AND pm.role = 'owner'
		)`,
		id, userID,
	)
	return err
}

func (r *Repo) GetProjectRole(ctx context.Context, projectID, userID string) (string, error) {
	var role string
	err := r.pool.QueryRow(ctx,
		`SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2`,
		projectID, userID,
	).Scan(&role)
	if err != nil {
		if err == pgx.ErrNoRows {
			return "", nil
		}
		return "", fmt.Errorf("get project role: %w", err)
	}
	return role, nil
}

func (r *Repo) CanAccessProject(ctx context.Context, projectID, userID string) (bool, error) {
	role, err := r.GetProjectRole(ctx, projectID, userID)
	if err != nil {
		return false, err
	}
	return role != "", nil
}

func (r *Repo) RequireProjectRole(ctx context.Context, projectID, userID string, allowedRoles ...string) (bool, error) {
	role, err := r.GetProjectRole(ctx, projectID, userID)
	if err != nil {
		return false, err
	}
	for _, allowedRole := range allowedRoles {
		if role == allowedRole {
			return true, nil
		}
	}
	return false, nil
}

func (r *Repo) ListProjectTaskStatuses(ctx context.Context, projectID string) ([]models.ProjectTaskStatus, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT `+taskStatusSelectColumns+`
		 FROM project_task_statuses
		 WHERE project_id = $1
		 ORDER BY position ASC, created_at ASC`,
		projectID,
	)
	if err != nil {
		return nil, fmt.Errorf("list project task statuses: %w", err)
	}
	defer rows.Close()

	var out []models.ProjectTaskStatus
	for rows.Next() {
		var status models.ProjectTaskStatus
		if err := scanProjectTaskStatusRow(rows, &status); err != nil {
			return nil, err
		}
		out = append(out, status)
	}
	if out == nil {
		out = []models.ProjectTaskStatus{}
	}
	return out, nil
}

func (r *Repo) GetProjectTaskStatusByKey(ctx context.Context, projectID, key string) (*models.ProjectTaskStatus, error) {
	status := &models.ProjectTaskStatus{}
	row := r.pool.QueryRow(ctx,
		`SELECT `+taskStatusSelectColumns+`
		 FROM project_task_statuses
		 WHERE project_id = $1 AND key = $2`,
		projectID, normalizeStatusKey(key),
	)
	if err := scanProjectTaskStatusRow(row, status); err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("get project task status by key: %w", err)
	}
	return status, nil
}

func (r *Repo) GetProjectTaskStatusByID(ctx context.Context, projectID, statusID string) (*models.ProjectTaskStatus, error) {
	status := &models.ProjectTaskStatus{}
	row := r.pool.QueryRow(ctx,
		`SELECT `+taskStatusSelectColumns+`
		 FROM project_task_statuses
		 WHERE project_id = $1 AND id = $2`,
		projectID, statusID,
	)
	if err := scanProjectTaskStatusRow(row, status); err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("get project task status by id: %w", err)
	}
	return status, nil
}

func (r *Repo) CreateProjectTaskStatus(ctx context.Context, projectID string, req models.CreateProjectTaskStatusRequest) (*models.ProjectTaskStatus, error) {
	statuses, err := r.ListProjectTaskStatuses(ctx, projectID)
	if err != nil {
		return nil, err
	}
	keyBase := normalizeStatusKey(req.Label)
	key := keyBase
	suffix := 1
	exists := func(candidate string) bool {
		for _, status := range statuses {
			if status.Key == candidate {
				return true
			}
		}
		return false
	}
	for exists(key) {
		suffix++
		key = keyBase + "-" + strconv.Itoa(suffix)
	}

	status := &models.ProjectTaskStatus{}
	row := r.pool.QueryRow(ctx,
		`INSERT INTO project_task_statuses (project_id, key, label, color_token, position, is_completed_state, is_builtin)
		 VALUES ($1, $2, $3, $4, $5, $6, FALSE)
		 RETURNING `+taskStatusSelectColumns,
		projectID,
		key,
		strings.TrimSpace(req.Label),
		normalizeStatusColorToken(req.ColorToken),
		len(statuses),
		req.IsCompletedState,
	)
	if err := scanProjectTaskStatusRow(row, status); err != nil {
		return nil, fmt.Errorf("create project task status: %w", err)
	}
	return status, nil
}

func (r *Repo) UpdateProjectTaskStatus(ctx context.Context, projectID, statusID string, req models.UpdateProjectTaskStatusRequest) (*models.ProjectTaskStatus, error) {
	existing, err := r.GetProjectTaskStatusByID(ctx, projectID, statusID)
	if err != nil {
		return nil, err
	}
	if existing == nil {
		return nil, nil
	}

	isCompletedState := existing.IsCompletedState
	if req.IsCompletedState != nil {
		isCompletedState = *req.IsCompletedState
	}
	if existing.Key == "done" {
		isCompletedState = true
	}

	row := r.pool.QueryRow(ctx,
		`UPDATE project_task_statuses
		 SET label = COALESCE($3, label),
		     color_token = COALESCE($4, color_token),
		     is_completed_state = $5,
		     updated_at = NOW()
		 WHERE project_id = $1
		   AND id = $2
		 RETURNING `+taskStatusSelectColumns,
		projectID,
		statusID,
		req.Label,
		nullableNormalizedColorToken(req.ColorToken),
		isCompletedState,
	)

	status := &models.ProjectTaskStatus{}
	if err := scanProjectTaskStatusRow(row, status); err != nil {
		return nil, fmt.Errorf("update project task status: %w", err)
	}

	if _, err := r.pool.Exec(ctx,
		`UPDATE tasks
		 SET completed = $3
		 WHERE project_id = $1 AND kanban_status = $2`,
		projectID, status.Key, status.IsCompletedState,
	); err != nil {
		return nil, fmt.Errorf("sync task completion for status update: %w", err)
	}

	return status, nil
}

func (r *Repo) DeleteProjectTaskStatus(ctx context.Context, projectID, statusID, replacementStatusID string) error {
	status, err := r.GetProjectTaskStatusByID(ctx, projectID, statusID)
	if err != nil {
		return err
	}
	if status == nil {
		return nil
	}
	if status.IsBuiltin {
		return fmt.Errorf("cannot delete built-in status")
	}

	replacement, err := r.GetProjectTaskStatusByID(ctx, projectID, replacementStatusID)
	if err != nil {
		return err
	}
	if replacement == nil {
		return fmt.Errorf("replacement status not found")
	}

	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin delete project task status: %w", err)
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx,
		`UPDATE tasks
		 SET kanban_status = $3,
		     completed = $4
		 WHERE project_id = $1
		   AND kanban_status = $2`,
		projectID, status.Key, replacement.Key, replacement.IsCompletedState,
	); err != nil {
		return fmt.Errorf("reassign tasks for deleted status: %w", err)
	}

	if _, err := tx.Exec(ctx,
		`DELETE FROM project_task_statuses
		 WHERE project_id = $1
		   AND id = $2`,
		projectID, statusID,
	); err != nil {
		return fmt.Errorf("delete project task status: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit delete project task status: %w", err)
	}

	return nil
}

func (r *Repo) ReorderProjectTaskStatuses(ctx context.Context, projectID string, statusIDs []string) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin reorder project task statuses: %w", err)
	}
	defer tx.Rollback(ctx)

	for idx, statusID := range statusIDs {
		if _, err := tx.Exec(ctx,
			`UPDATE project_task_statuses
			 SET position = $3,
			     updated_at = NOW()
			 WHERE project_id = $1 AND id = $2`,
			projectID, statusID, idx,
		); err != nil {
			return fmt.Errorf("reorder project task statuses: %w", err)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit reorder project task statuses: %w", err)
	}
	return nil
}

func nullableNormalizedColorToken(value *string) *string {
	if value == nil {
		return nil
	}
	normalized := normalizeStatusColorToken(*value)
	return &normalized
}

func (r *Repo) ReorderProjectTasks(ctx context.Context, projectID string, updates []models.UpdateTaskRequestWithID) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin reorder project tasks: %w", err)
	}
	defer tx.Rollback(ctx)

	for _, update := range updates {
		if _, err := tx.Exec(ctx,
			`UPDATE tasks
			 SET kanban_status = COALESCE($3, kanban_status),
			     completed = COALESCE($4, completed),
			     sort_order = COALESCE($5, sort_order)
			 WHERE id = $1
			   AND project_id = $2`,
			update.ID, projectID, update.KanbanStatus, update.Completed, update.Order,
		); err != nil {
			return fmt.Errorf("reorder task %s: %w", update.ID, err)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit reorder project tasks: %w", err)
	}
	return nil
}

func (r *Repo) ListProjectMemberUserIDs(ctx context.Context, projectID string) ([]string, error) {
	rows, err := r.pool.Query(ctx, `SELECT user_id::text FROM project_members WHERE project_id = $1`, projectID)
	if err != nil {
		return nil, fmt.Errorf("list project member user ids: %w", err)
	}
	defer rows.Close()

	var out []string
	for rows.Next() {
		var userID string
		if err := rows.Scan(&userID); err != nil {
			return nil, err
		}
		out = append(out, userID)
	}
	if out == nil {
		out = []string{}
	}
	return out, nil
}

func (r *Repo) ListProjectMembers(ctx context.Context, projectID string) ([]models.ProjectMember, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT pm.id, pm.project_id, pm.user_id, u.email, u.name, pm.role, pm.joined_at
		 FROM project_members pm
		 JOIN users u ON u.id = pm.user_id
		 WHERE pm.project_id = $1
		 ORDER BY CASE pm.role
		 	WHEN 'owner' THEN 0
		 	WHEN 'admin' THEN 1
		 	WHEN 'editor' THEN 2
		 	ELSE 3
		 END, u.email ASC`,
		projectID,
	)
	if err != nil {
		return nil, fmt.Errorf("list project members: %w", err)
	}
	defer rows.Close()

	var out []models.ProjectMember
	for rows.Next() {
		var member models.ProjectMember
		if err := rows.Scan(&member.ID, &member.ProjectID, &member.UserID, &member.Email, &member.Name, &member.Role, &member.JoinedAt); err != nil {
			return nil, err
		}
		out = append(out, member)
	}
	if out == nil {
		out = []models.ProjectMember{}
	}
	return out, nil
}

func (r *Repo) CreateProjectMember(ctx context.Context, projectID, userID, role string) (*models.ProjectMember, error) {
	member := &models.ProjectMember{}
	err := r.pool.QueryRow(ctx,
		`INSERT INTO project_members (project_id, user_id, role)
		 VALUES ($1, $2, $3)
		 ON CONFLICT (project_id, user_id) DO UPDATE SET role = EXCLUDED.role
		 RETURNING id, project_id, user_id, joined_at`,
		projectID, userID, role,
	).Scan(&member.ID, &member.ProjectID, &member.UserID, &member.JoinedAt)
	if err != nil {
		return nil, fmt.Errorf("create project member: %w", err)
	}

	user, err := r.GetUserByID(ctx, userID)
	if err != nil || user == nil {
		return nil, fmt.Errorf("load project member user: %w", err)
	}
	member.Email = user.Email
	member.Name = user.Name
	member.Role = role
	return member, nil
}

func (r *Repo) UpdateProjectMemberRole(ctx context.Context, projectID, userID, role string) (*models.ProjectMember, error) {
	member := &models.ProjectMember{}
	err := r.pool.QueryRow(ctx,
		`UPDATE project_members pm
		 SET role = $3
		 FROM users u
		 WHERE pm.project_id = $1 AND pm.user_id = $2 AND u.id = pm.user_id
		 RETURNING pm.id, pm.project_id, pm.user_id, u.email, u.name, pm.role, pm.joined_at`,
		projectID, userID, role,
	).Scan(&member.ID, &member.ProjectID, &member.UserID, &member.Email, &member.Name, &member.Role, &member.JoinedAt)
	if err != nil {
		return nil, fmt.Errorf("update project member role: %w", err)
	}
	return member, nil
}

func (r *Repo) RemoveProjectMember(ctx context.Context, projectID, userID string) error {
	_, err := r.pool.Exec(ctx, `DELETE FROM project_members WHERE project_id = $1 AND user_id = $2`, projectID, userID)
	if err != nil {
		return fmt.Errorf("remove project member: %w", err)
	}
	return nil
}

func (r *Repo) CreateInvitation(ctx context.Context, invitedByID string, req models.CreateInvitationRequest, tokenHash string, invitedUserID *string, expiresAt time.Time) (*models.TeamInvitation, error) {
	invite := &models.TeamInvitation{}
	err := r.pool.QueryRow(ctx,
		`INSERT INTO team_invitations (project_id, invited_by_id, invited_user_id, email, role, token_hash, expires_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)
		 RETURNING id, project_id, email, role, status, invited_user_id, invited_by_id, expires_at, accepted_at, created_at`,
		req.ProjectID, invitedByID, invitedUserID, req.Email, req.Role, tokenHash, expiresAt,
	).Scan(&invite.ID, &invite.ProjectID, &invite.Email, &invite.Role, &invite.Status, &invite.InvitedUserID, &invite.InvitedByID, &invite.ExpiresAt, &invite.AcceptedAt, &invite.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("create invitation: %w", err)
	}
	return invite, nil
}

func (r *Repo) ListInvitations(ctx context.Context, projectID string) ([]models.TeamInvitation, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, project_id, email, role, status, invited_user_id, invited_by_id, expires_at, accepted_at, created_at
		 FROM team_invitations
		 WHERE project_id = $1
		 ORDER BY created_at DESC`,
		projectID,
	)
	if err != nil {
		return nil, fmt.Errorf("list invitations: %w", err)
	}
	defer rows.Close()

	var out []models.TeamInvitation
	for rows.Next() {
		var invite models.TeamInvitation
		if err := rows.Scan(&invite.ID, &invite.ProjectID, &invite.Email, &invite.Role, &invite.Status, &invite.InvitedUserID, &invite.InvitedByID, &invite.ExpiresAt, &invite.AcceptedAt, &invite.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, invite)
	}
	if out == nil {
		out = []models.TeamInvitation{}
	}
	return out, nil
}

func (r *Repo) GetInvitationByTokenHash(ctx context.Context, tokenHash string) (*models.TeamInvitation, error) {
	invite := &models.TeamInvitation{}
	err := r.pool.QueryRow(ctx,
		`SELECT id, project_id, email, role, status, invited_user_id, invited_by_id, expires_at, accepted_at, created_at
		 FROM team_invitations
		 WHERE token_hash = $1`,
		tokenHash,
	).Scan(&invite.ID, &invite.ProjectID, &invite.Email, &invite.Role, &invite.Status, &invite.InvitedUserID, &invite.InvitedByID, &invite.ExpiresAt, &invite.AcceptedAt, &invite.CreatedAt)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("get invitation by token hash: %w", err)
	}
	return invite, nil
}

func (r *Repo) AcceptInvitation(ctx context.Context, invitationID, userID string) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE team_invitations
		 SET status = 'accepted', invited_user_id = $2, accepted_at = NOW()
		 WHERE id = $1`,
		invitationID, userID,
	)
	if err != nil {
		return fmt.Errorf("accept invitation: %w", err)
	}
	return nil
}

func (r *Repo) CancelInvitation(ctx context.Context, invitationID string) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE team_invitations
		 SET status = 'cancelled'
		 WHERE id = $1`,
		invitationID,
	)
	if err != nil {
		return fmt.Errorf("cancel invitation: %w", err)
	}
	return nil
}

func (r *Repo) CreateProjectFile(ctx context.Context, uploaderID string, req models.CreateProjectFileRequest, sizeBytes int64, storagePath string) (*models.ProjectFile, error) {
	file := &models.ProjectFile{}
	err := r.pool.QueryRow(ctx,
		`INSERT INTO project_files (project_id, task_id, uploader_id, encrypted_name, content_type, iv, size_bytes, storage_path, is_encrypted)
		 VALUES ($1, NULLIF($2, '')::uuid, $3, $4, $5, NULLIF($6, ''), $7, $8, $9)
		 RETURNING id, project_id, task_id, uploader_id, encrypted_name, content_type, iv, size_bytes, storage_path, is_encrypted, created_at`,
		req.ProjectID, req.TaskID, uploaderID, req.EncryptedName, req.ContentType, req.IV, sizeBytes, storagePath, req.IsEncrypted,
	).Scan(&file.ID, &file.ProjectID, &file.TaskID, &file.UploaderID, &file.EncryptedName, &file.ContentType, &file.IV, &file.SizeBytes, &file.StoragePath, &file.IsEncrypted, &file.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("create project file: %w", err)
	}

	user, err := r.GetUserByID(ctx, uploaderID)
	if err == nil && user != nil {
		file.UploaderName = &user.Name
	}
	return file, nil
}

func (r *Repo) ListProjectFiles(ctx context.Context, projectID string) ([]models.ProjectFile, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT pf.id, pf.project_id, pf.task_id, pf.uploader_id, pf.encrypted_name, pf.content_type, pf.iv, pf.size_bytes, pf.storage_path, pf.is_encrypted, pf.created_at, u.name
		 FROM project_files pf
		 JOIN users u ON u.id = pf.uploader_id
		 WHERE pf.project_id = $1 AND pf.task_id IS NULL
		 ORDER BY pf.created_at DESC`,
		projectID,
	)
	if err != nil {
		return nil, fmt.Errorf("list project files: %w", err)
	}
	defer rows.Close()

	var out []models.ProjectFile
	for rows.Next() {
		var file models.ProjectFile
		if err := rows.Scan(&file.ID, &file.ProjectID, &file.TaskID, &file.UploaderID, &file.EncryptedName, &file.ContentType, &file.IV, &file.SizeBytes, &file.StoragePath, &file.IsEncrypted, &file.CreatedAt, &file.UploaderName); err != nil {
			return nil, err
		}
		out = append(out, file)
	}
	if out == nil {
		out = []models.ProjectFile{}
	}
	return out, nil
}

func (r *Repo) ListTaskFiles(ctx context.Context, taskID, userID string) ([]models.ProjectFile, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT pf.id, pf.project_id, pf.task_id, pf.uploader_id, pf.encrypted_name, pf.content_type, pf.iv, pf.size_bytes, pf.storage_path, pf.is_encrypted, pf.created_at, u.name
		 FROM project_files pf
		 JOIN users u ON u.id = pf.uploader_id
		 JOIN tasks t ON t.id = pf.task_id
		 WHERE pf.task_id = $1 AND EXISTS (
		 	SELECT 1 FROM project_members pm
		 	WHERE pm.project_id = t.project_id AND pm.user_id = $2
		 )
		 ORDER BY pf.created_at DESC`,
		taskID, userID,
	)
	if err != nil {
		return nil, fmt.Errorf("list task files: %w", err)
	}
	defer rows.Close()

	var out []models.ProjectFile
	for rows.Next() {
		var file models.ProjectFile
		if err := rows.Scan(&file.ID, &file.ProjectID, &file.TaskID, &file.UploaderID, &file.EncryptedName, &file.ContentType, &file.IV, &file.SizeBytes, &file.StoragePath, &file.IsEncrypted, &file.CreatedAt, &file.UploaderName); err != nil {
			return nil, err
		}
		out = append(out, file)
	}
	if out == nil {
		out = []models.ProjectFile{}
	}
	return out, nil
}

func (r *Repo) GetProjectFile(ctx context.Context, fileID, userID string) (*models.ProjectFile, error) {
	file := &models.ProjectFile{}
	err := r.pool.QueryRow(ctx,
		`SELECT pf.id, pf.project_id, pf.task_id, pf.uploader_id, pf.encrypted_name, pf.content_type, pf.iv, pf.size_bytes, pf.storage_path, pf.is_encrypted, pf.created_at, u.name
		 FROM project_files pf
		 JOIN users u ON u.id = pf.uploader_id
		 WHERE pf.id = $1 AND EXISTS (
		 	SELECT 1 FROM project_members pm
		 	WHERE pm.project_id = pf.project_id AND pm.user_id = $2
		 )`,
		fileID, userID,
	).Scan(&file.ID, &file.ProjectID, &file.TaskID, &file.UploaderID, &file.EncryptedName, &file.ContentType, &file.IV, &file.SizeBytes, &file.StoragePath, &file.IsEncrypted, &file.CreatedAt, &file.UploaderName)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("get project file: %w", err)
	}
	return file, nil
}

func (r *Repo) DeleteProjectFile(ctx context.Context, fileID string) error {
	_, err := r.pool.Exec(ctx, `DELETE FROM project_files WHERE id = $1`, fileID)
	if err != nil {
		return fmt.Errorf("delete project file: %w", err)
	}
	return nil
}

func (r *Repo) ListTaskAssignees(ctx context.Context, taskID string) ([]models.TaskAssignee, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT ta.task_id, ta.user_id, u.name, u.email, ta.assigned_by_id, ta.created_at
		 FROM task_assignees ta
		 JOIN users u ON u.id = ta.user_id
		 WHERE ta.task_id = $1
		 ORDER BY ta.created_at ASC`,
		taskID,
	)
	if err != nil {
		return nil, fmt.Errorf("list task assignees: %w", err)
	}
	defer rows.Close()

	var out []models.TaskAssignee
	for rows.Next() {
		var assignee models.TaskAssignee
		if err := rows.Scan(&assignee.TaskID, &assignee.UserID, &assignee.Name, &assignee.Email, &assignee.AssignedBy, &assignee.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, assignee)
	}
	if out == nil {
		out = []models.TaskAssignee{}
	}
	return out, nil
}

func (r *Repo) AddTaskAssignee(ctx context.Context, taskID, userID, assignedByID string) (*models.TaskAssignee, error) {
	assignee := &models.TaskAssignee{}
	err := r.pool.QueryRow(ctx,
		`INSERT INTO task_assignees (task_id, user_id, assigned_by_id)
		 VALUES ($1, $2, $3)
		 ON CONFLICT (task_id, user_id) DO UPDATE SET assigned_by_id = EXCLUDED.assigned_by_id
		 RETURNING task_id, user_id, assigned_by_id, created_at`,
		taskID, userID, assignedByID,
	).Scan(&assignee.TaskID, &assignee.UserID, &assignee.AssignedBy, &assignee.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("add task assignee: %w", err)
	}
	user, err := r.GetUserByID(ctx, userID)
	if err == nil && user != nil {
		assignee.Name = user.Name
		assignee.Email = user.Email
	}
	return assignee, nil
}

func (r *Repo) RemoveTaskAssignee(ctx context.Context, taskID, userID string) error {
	if _, err := r.pool.Exec(ctx, `DELETE FROM task_assignees WHERE task_id = $1 AND user_id = $2`, taskID, userID); err != nil {
		return fmt.Errorf("remove task assignee: %w", err)
	}
	return nil
}

func (r *Repo) ListTaskComments(ctx context.Context, taskID string) ([]models.TaskComment, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT tc.id, tc.task_id, tc.user_id, u.name, u.email, tc.body, tc.mentioned_user_ids, tc.is_encrypted, tc.created_at, tc.updated_at
		 FROM task_comments tc
		 JOIN users u ON u.id = tc.user_id
		 WHERE tc.task_id = $1
		 ORDER BY tc.created_at ASC`,
		taskID,
	)
	if err != nil {
		return nil, fmt.Errorf("list task comments: %w", err)
	}
	defer rows.Close()

	var out []models.TaskComment
	for rows.Next() {
		var comment models.TaskComment
		if err := rows.Scan(&comment.ID, &comment.TaskID, &comment.UserID, &comment.UserName, &comment.UserEmail, &comment.Body, &comment.MentionedUserIDs, &comment.IsEncrypted, &comment.CreatedAt, &comment.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, comment)
	}
	if out == nil {
		out = []models.TaskComment{}
	}
	return out, nil
}

func (r *Repo) CreateTaskComment(ctx context.Context, taskID, userID string, req models.CreateTaskCommentRequest) (*models.TaskComment, error) {
	comment := &models.TaskComment{}
	err := r.pool.QueryRow(ctx,
		`INSERT INTO task_comments (task_id, user_id, body, mentioned_user_ids, is_encrypted)
		 VALUES ($1, $2, $3, COALESCE($4::text[], '{}'::text[]), $5)
		 RETURNING id, task_id, user_id, body, mentioned_user_ids, is_encrypted, created_at, updated_at`,
		taskID, userID, req.Body, req.MentionedUserIDs, req.IsEncrypted,
	).Scan(&comment.ID, &comment.TaskID, &comment.UserID, &comment.Body, &comment.MentionedUserIDs, &comment.IsEncrypted, &comment.CreatedAt, &comment.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("create task comment: %w", err)
	}
	user, err := r.GetUserByID(ctx, userID)
	if err == nil && user != nil {
		comment.UserName = user.Name
		comment.UserEmail = user.Email
	}
	return comment, nil
}

func (r *Repo) DeleteTaskComment(ctx context.Context, commentID, userID string) error {
	if _, err := r.pool.Exec(ctx, `DELETE FROM task_comments WHERE id = $1 AND user_id = $2`, commentID, userID); err != nil {
		return fmt.Errorf("delete task comment: %w", err)
	}
	return nil
}

func (r *Repo) UpsertProjectPresence(ctx context.Context, projectID, userID string) error {
	if _, err := r.pool.Exec(ctx,
		`INSERT INTO project_presence (project_id, user_id, last_seen)
		 VALUES ($1, $2, NOW())
		 ON CONFLICT (project_id, user_id) DO UPDATE SET last_seen = NOW()`,
		projectID, userID,
	); err != nil {
		return fmt.Errorf("upsert project presence: %w", err)
	}
	return nil
}

func (r *Repo) UpsertTaskPresence(ctx context.Context, taskID, userID string) error {
	if _, err := r.pool.Exec(ctx,
		`INSERT INTO task_presence (task_id, user_id, last_seen)
		 VALUES ($1, $2, NOW())
		 ON CONFLICT (task_id, user_id) DO UPDATE SET last_seen = NOW()`,
		taskID, userID,
	); err != nil {
		return fmt.Errorf("upsert task presence: %w", err)
	}
	return nil
}

func (r *Repo) ListProjectPresence(ctx context.Context, projectID string) ([]models.PresenceSession, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT pp.user_id, u.name, u.email, pp.last_seen
		 FROM project_presence pp
		 JOIN users u ON u.id = pp.user_id
		 WHERE pp.project_id = $1 AND pp.last_seen >= NOW() - INTERVAL '45 seconds'
		 ORDER BY pp.last_seen DESC`,
		projectID,
	)
	if err != nil {
		return nil, fmt.Errorf("list project presence: %w", err)
	}
	defer rows.Close()
	var out []models.PresenceSession
	for rows.Next() {
		var item models.PresenceSession
		if err := rows.Scan(&item.UserID, &item.Name, &item.Email, &item.LastSeen); err != nil {
			return nil, err
		}
		out = append(out, item)
	}
	if out == nil {
		out = []models.PresenceSession{}
	}
	return out, nil
}

func (r *Repo) ListTaskPresence(ctx context.Context, taskID string) ([]models.PresenceSession, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT tp.user_id, u.name, u.email, tp.last_seen
		 FROM task_presence tp
		 JOIN users u ON u.id = tp.user_id
		 WHERE tp.task_id = $1 AND tp.last_seen >= NOW() - INTERVAL '45 seconds'
		 ORDER BY tp.last_seen DESC`,
		taskID,
	)
	if err != nil {
		return nil, fmt.Errorf("list task presence: %w", err)
	}
	defer rows.Close()
	var out []models.PresenceSession
	for rows.Next() {
		var item models.PresenceSession
		if err := rows.Scan(&item.UserID, &item.Name, &item.Email, &item.LastSeen); err != nil {
			return nil, err
		}
		out = append(out, item)
	}
	if out == nil {
		out = []models.PresenceSession{}
	}
	return out, nil
}

// ---- Tasks ----

func scanTasks(rows pgx.Rows) ([]models.Task, error) {
	var out []models.Task
	for rows.Next() {
		var t models.Task
		if err := scanTaskRow(rows, &t); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	if out == nil {
		out = []models.Task{}
	}
	return out, nil
}

func (r *Repo) GetTask(ctx context.Context, id, userID string) (*models.Task, error) {
	t := &models.Task{}
	row := r.pool.QueryRow(ctx,
		`SELECT `+taskSelectColumns+`
		 FROM tasks
		 WHERE id = $1 AND EXISTS (
		 	SELECT 1 FROM project_members pm
		 	WHERE pm.project_id = tasks.project_id AND pm.user_id = $2
		 )`, id, userID,
	)
	if err := scanTaskRow(row, t); err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("get task: %w", err)
	}
	return t, nil
}

func (r *Repo) GetTaskByKey(ctx context.Context, projectID, taskKey, userID string) (*models.Task, error) {
	t := &models.Task{}
	row := r.pool.QueryRow(ctx,
		`SELECT `+taskSelectColumns+`
		 FROM tasks
		 WHERE project_id = $1
		   AND task_key = $2
		   AND EXISTS (
		   	SELECT 1 FROM project_members pm
		   	WHERE pm.project_id = tasks.project_id AND pm.user_id = $3
		   )`,
		projectID, taskKey, userID,
	)
	if err := scanTaskRow(row, t); err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("get task by key: %w", err)
	}
	return t, nil
}

func (r *Repo) HasIncompleteDependencies(ctx context.Context, userID string, dependencyIDs []string) (bool, error) {
	if len(dependencyIDs) == 0 {
		return false, nil
	}

	var count int
	err := r.pool.QueryRow(ctx,
		`SELECT COUNT(*)
		 FROM tasks t
		 JOIN project_members pm ON pm.project_id = t.project_id
		 WHERE pm.user_id = $1 AND t.id = ANY($2::uuid[]) AND t.completed = false`,
		userID, dependencyIDs,
	).Scan(&count)
	if err != nil {
		return false, fmt.Errorf("check incomplete dependencies: %w", err)
	}

	return count > 0, nil
}

func (r *Repo) ListTasks(ctx context.Context, projectID, userID string) ([]models.Task, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT `+taskSelectColumns+`
		 FROM tasks
		 WHERE project_id = $1 AND EXISTS (
		 	SELECT 1 FROM project_members pm
		 	WHERE pm.project_id = tasks.project_id AND pm.user_id = $2
		 )
		 ORDER BY sort_order ASC`, projectID, userID)
	if err != nil {
		return nil, fmt.Errorf("list tasks: %w", err)
	}
	defer rows.Close()
	return scanTasks(rows)
}

func (r *Repo) ListAllTasks(ctx context.Context, userID string, limit int) ([]models.Task, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT `+taskSelectColumns+`
		 FROM tasks
		 WHERE EXISTS (
		 	SELECT 1 FROM project_members pm
		 	WHERE pm.project_id = tasks.project_id AND pm.user_id = $1
		 )
		 ORDER BY created_at DESC LIMIT $2`, userID, limit)
	if err != nil {
		return nil, fmt.Errorf("list all tasks: %w", err)
	}
	defer rows.Close()
	return scanTasks(rows)
}

func (r *Repo) CreateTask(ctx context.Context, userID string, req models.CreateTaskRequest) (*models.Task, error) {
	t := &models.Task{}
	kanban := req.KanbanStatus
	if kanban == "" {
		kanban = "todo"
	}
	project, err := r.GetProject(ctx, req.ProjectID, userID)
	if err != nil {
		return nil, fmt.Errorf("load project for create task: %w", err)
	}
	if project == nil {
		return nil, fmt.Errorf("project not found")
	}
	status, err := r.GetProjectTaskStatusByKey(ctx, req.ProjectID, kanban)
	if err != nil {
		return nil, fmt.Errorf("load task status for create task: %w", err)
	}
	if status == nil {
		return nil, fmt.Errorf("unknown task status")
	}

	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin create task: %w", err)
	}
	defer tx.Rollback(ctx)

	var taskNumber int
	if err := tx.QueryRow(ctx,
		`UPDATE projects
		 SET next_task_number = next_task_number + 1
		 WHERE id = $1
		 RETURNING next_task_number - 1`,
		req.ProjectID,
	).Scan(&taskNumber); err != nil {
		return nil, fmt.Errorf("reserve next task number: %w", err)
	}

	row := tx.QueryRow(ctx,
		`INSERT INTO tasks (user_id, project_id, task_number, task_key, title, description, completed, sort_order, priority, kanban_status, is_encrypted, parent_id, tags, dependencies, recurrence)
			 SELECT $1, $2, $3, $4, $5, COALESCE($6, ''), $7, $8, 'medium', $9, $10, $11, COALESCE($12::text[], '{}'::text[]), COALESCE($13::text[], '{}'::text[]), NULLIF($14::text, '')
			 WHERE EXISTS (
			 	SELECT 1 FROM project_members pm
			 	WHERE pm.project_id = $2 AND pm.user_id = $1 AND pm.role IN ('owner', 'admin', 'editor')
			 )
			 RETURNING `+taskSelectColumns,
		userID, req.ProjectID, taskNumber, fmt.Sprintf("%s-%d", project.TaskKeyPrefix, taskNumber), req.Title, req.Description, status.IsCompletedState, req.Order, status.Key, req.IsEncrypted, req.ParentID, req.Tags, req.Dependencies, req.Recurrence,
	)
	if err := scanTaskRow(row, t); err != nil {
		return nil, fmt.Errorf("create task: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit create task: %w", err)
	}
	return t, nil
}

func (r *Repo) CreateTasksBatch(ctx context.Context, userID string, req models.CreateTasksBatchRequest) ([]models.Task, error) {
	project, err := r.GetProject(ctx, req.ProjectID, userID)
	if err != nil {
		return nil, fmt.Errorf("load project for create tasks batch: %w", err)
	}
	if project == nil {
		return nil, fmt.Errorf("project not found")
	}

	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin create tasks batch: %w", err)
	}
	defer tx.Rollback(ctx)

	var startOrder int
	if err := tx.QueryRow(ctx, `SELECT COALESCE(MAX(sort_order), -1) + 1 FROM tasks WHERE project_id = $1`, req.ProjectID).Scan(&startOrder); err != nil {
		return nil, fmt.Errorf("load batch start order: %w", err)
	}

	var nextTaskNumber int
	if err := tx.QueryRow(ctx,
		`UPDATE projects
		 SET next_task_number = next_task_number + $2
		 WHERE id = $1
		 RETURNING next_task_number - $2`,
		req.ProjectID, len(req.Titles),
	).Scan(&nextTaskNumber); err != nil {
		return nil, fmt.Errorf("reserve batch task numbers: %w", err)
	}
	var tasks []models.Task
	for i, title := range req.Titles {
		t := &models.Task{}
		row := tx.QueryRow(ctx,
			`INSERT INTO tasks (user_id, project_id, task_number, task_key, title, description, completed, sort_order, priority, kanban_status, is_encrypted)
				 SELECT $1, $2, $3, $4, $5, '', false, $6, 'medium', 'todo', $7
			 WHERE EXISTS (
			 	SELECT 1 FROM project_members pm
			 	WHERE pm.project_id = $2 AND pm.user_id = $1 AND pm.role IN ('owner', 'admin', 'editor')
			 )
			 RETURNING `+taskSelectColumns,
			userID, req.ProjectID, nextTaskNumber+i, fmt.Sprintf("%s-%d", project.TaskKeyPrefix, nextTaskNumber+i), title, startOrder+i, req.IsEncrypted,
		)
		if err := scanTaskRow(row, t); err != nil {
			return nil, fmt.Errorf("create task batch %d: %w", i, err)
		}
		tasks = append(tasks, *t)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit create tasks batch: %w", err)
	}
	return tasks, nil
}

func (r *Repo) CreateRecurringTask(ctx context.Context, userID string, source models.Task, nextDeadline time.Time) (*models.Task, error) {
	t := &models.Task{}
	var nextOrder int
	if err := r.pool.QueryRow(ctx,
		`SELECT COALESCE(MAX(sort_order), -1) + 1 FROM tasks WHERE project_id = $1`,
		source.ProjectID,
	).Scan(&nextOrder); err != nil {
		return nil, fmt.Errorf("next recurring task order: %w", err)
	}

	project, err := r.GetProject(ctx, source.ProjectID, userID)
	if err != nil {
		return nil, fmt.Errorf("load project for recurring task: %w", err)
	}
	if project == nil {
		return nil, fmt.Errorf("project not found")
	}

	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin recurring task: %w", err)
	}
	defer tx.Rollback(ctx)

	var taskNumber int
	if err := tx.QueryRow(ctx,
		`UPDATE projects
		 SET next_task_number = next_task_number + 1
		 WHERE id = $1
		 RETURNING next_task_number - 1`,
		source.ProjectID,
	).Scan(&taskNumber); err != nil {
		return nil, fmt.Errorf("reserve recurring task number: %w", err)
	}

	row := tx.QueryRow(ctx,
		`INSERT INTO tasks (user_id, project_id, task_number, task_key, title, description, completed, sort_order, priority, kanban_status, deadline, tags, dependencies, recurrence, is_encrypted)
			 VALUES ($1, $2, $3, $4, $5, $6, false, $7, $8, 'todo', $9, COALESCE($10::text[], '{}'::text[]), COALESCE($11::text[], '{}'::text[]), $12, $13)
			 RETURNING `+taskSelectColumns,
		userID, source.ProjectID, taskNumber, fmt.Sprintf("%s-%d", project.TaskKeyPrefix, taskNumber), source.Title, source.Description, nextOrder, source.Priority, nextDeadline, source.Tags, source.Dependencies, source.Recurrence, source.IsEncrypted,
	)
	if err := scanTaskRow(row, t); err != nil {
		return nil, fmt.Errorf("create recurring task: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit recurring task: %w", err)
	}

	return t, nil
}

func (r *Repo) UpdateTask(ctx context.Context, id, userID string, req models.UpdateTaskRequest) (*models.Task, error) {
	t := &models.Task{}
	row := r.pool.QueryRow(ctx,
		`UPDATE tasks SET
				title = COALESCE($3, title), description = COALESCE($4, description), completed = COALESCE($5, completed), parent_id = COALESCE($6, parent_id),
				time_spent = COALESCE($7, time_spent), is_timer_running = COALESCE($8, is_timer_running),
				timer_started_at = CASE WHEN $9::text IS NOT NULL THEN $9::timestamptz ELSE timer_started_at END,
				time_entries = COALESCE($10, time_entries), sort_order = COALESCE($11, sort_order),
				priority = COALESCE($12, priority), kanban_status = COALESCE($13, kanban_status),
				deadline = CASE WHEN $14::text IS NOT NULL THEN $14::timestamptz ELSE deadline END,
				notes = COALESCE($15, notes), tags = COALESCE($16, tags), dependencies = COALESCE($17, dependencies),
				recurrence = CASE WHEN $18::text IS NOT NULL THEN NULLIF($18::text, '') ELSE recurrence END,
				is_encrypted = COALESCE($19, is_encrypted)
		 WHERE id = $1 AND EXISTS (
		 	SELECT 1 FROM project_members pm
		 	WHERE pm.project_id = tasks.project_id AND pm.user_id = $2 AND pm.role IN ('owner', 'admin', 'editor')
		 )
		 RETURNING `+taskSelectColumns,
		id, userID, req.Title, req.Description, req.Completed, req.ParentID, req.TimeSpent, req.IsTimerRunning, req.TimerStartedAt, req.TimeEntries, req.Order, req.Priority, req.KanbanStatus, req.Deadline, req.Notes, req.Tags, req.Dependencies, req.Recurrence, req.IsEncrypted,
	)
	if err := scanTaskRow(row, t); err != nil {
		return nil, fmt.Errorf("update task: %w", err)
	}
	return t, nil
}

func (r *Repo) DeleteTask(ctx context.Context, id, userID string) error {
	_, err := r.pool.Exec(ctx,
		`DELETE FROM tasks WHERE id = $1 AND EXISTS (
			SELECT 1 FROM project_members pm
			WHERE pm.project_id = tasks.project_id AND pm.user_id = $2 AND pm.role IN ('owner', 'admin', 'editor')
		)`,
		id, userID,
	)
	return err
}

// ---- Wiki Guides ----

func (r *Repo) ListGuides(ctx context.Context, userID string) ([]models.WikiGuide, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, user_id, title, description, is_encrypted, created_at, updated_at FROM wiki_guides WHERE user_id = $1 ORDER BY created_at DESC`, userID)
	if err != nil {
		return nil, fmt.Errorf("list guides: %w", err)
	}
	defer rows.Close()
	var out []models.WikiGuide
	for rows.Next() {
		var g models.WikiGuide
		if err := rows.Scan(&g.ID, &g.UserID, &g.Title, &g.Description, &g.IsEncrypted, &g.CreatedAt, &g.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, g)
	}
	if out == nil {
		out = []models.WikiGuide{}
	}
	return out, nil
}

func (r *Repo) GetGuide(ctx context.Context, id, userID string) (*models.WikiGuide, error) {
	g := &models.WikiGuide{}
	err := r.pool.QueryRow(ctx,
		`SELECT id, user_id, title, description, is_encrypted, created_at, updated_at FROM wiki_guides WHERE id = $1 AND user_id = $2`, id, userID,
	).Scan(&g.ID, &g.UserID, &g.Title, &g.Description, &g.IsEncrypted, &g.CreatedAt, &g.UpdatedAt)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("get guide: %w", err)
	}
	installations, err := r.ListInstallations(ctx, id, userID)
	if err != nil {
		return nil, err
	}
	g.Installations = installations
	return g, nil
}

func (r *Repo) CreateGuide(ctx context.Context, userID string, req models.CreateGuideRequest) (*models.WikiGuide, error) {
	g := &models.WikiGuide{}
	err := r.pool.QueryRow(ctx,
		`INSERT INTO wiki_guides (user_id, title, description, is_encrypted) VALUES ($1, $2, $3, $4)
		 RETURNING id, user_id, title, description, is_encrypted, created_at, updated_at`,
		userID, req.Title, req.Description, req.IsEncrypted,
	).Scan(&g.ID, &g.UserID, &g.Title, &g.Description, &g.IsEncrypted, &g.CreatedAt, &g.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("create guide: %w", err)
	}
	return g, nil
}

func (r *Repo) UpdateGuide(ctx context.Context, id, userID string, req models.UpdateGuideRequest) (*models.WikiGuide, error) {
	g := &models.WikiGuide{}
	err := r.pool.QueryRow(ctx,
		`UPDATE wiki_guides SET title = COALESCE($3, title), description = COALESCE($4, description), is_encrypted = COALESCE($5, is_encrypted)
		 WHERE id = $1 AND user_id = $2
		 RETURNING id, user_id, title, description, is_encrypted, created_at, updated_at`,
		id, userID, req.Title, req.Description, req.IsEncrypted,
	).Scan(&g.ID, &g.UserID, &g.Title, &g.Description, &g.IsEncrypted, &g.CreatedAt, &g.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("update guide: %w", err)
	}
	return g, nil
}

func (r *Repo) DeleteGuide(ctx context.Context, id, userID string) error {
	_, err := r.pool.Exec(ctx, `DELETE FROM wiki_guides WHERE id = $1 AND user_id = $2`, id, userID)
	return err
}

// ---- Installations ----

func (r *Repo) ListInstallations(ctx context.Context, guideID, userID string) ([]models.InstallationTarget, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, user_id, guide_id, target, git_repo, documentation, notes, tasks, is_encrypted, iv, created_at, updated_at
		 FROM installations WHERE guide_id = $1 AND user_id = $2 ORDER BY created_at ASC`, guideID, userID)
	if err != nil {
		return nil, fmt.Errorf("list installations: %w", err)
	}
	defer rows.Close()
	var out []models.InstallationTarget
	for rows.Next() {
		var i models.InstallationTarget
		if err := rows.Scan(&i.ID, &i.UserID, &i.GuideID, &i.Target, &i.GitRepo, &i.Documentation, &i.Notes, &i.Tasks, &i.IsEncrypted, &i.IV, &i.CreatedAt, &i.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, i)
	}
	if out == nil {
		out = []models.InstallationTarget{}
	}
	return out, nil
}

func (r *Repo) CreateInstallation(ctx context.Context, userID string, req models.CreateInstallationRequest) (*models.InstallationTarget, error) {
	inst := &models.InstallationTarget{}
	tasksJSON, _ := json.Marshal(req.Tasks)
	if req.Tasks == nil {
		tasksJSON = []byte("[]")
	}
	err := r.pool.QueryRow(ctx,
		`INSERT INTO installations (user_id, guide_id, target, git_repo, documentation, notes, tasks, is_encrypted, iv)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		 RETURNING id, user_id, guide_id, target, git_repo, documentation, notes, tasks, is_encrypted, iv, created_at, updated_at`,
		userID, req.GuideID, req.Target, req.GitRepo, req.Documentation, req.Notes, tasksJSON, req.IsEncrypted, req.IV,
	).Scan(&inst.ID, &inst.UserID, &inst.GuideID, &inst.Target, &inst.GitRepo, &inst.Documentation, &inst.Notes, &inst.Tasks, &inst.IsEncrypted, &inst.IV, &inst.CreatedAt, &inst.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("create installation: %w", err)
	}
	return inst, nil
}

func (r *Repo) UpdateInstallation(ctx context.Context, id, userID string, req models.UpdateInstallationRequest) (*models.InstallationTarget, error) {
	inst := &models.InstallationTarget{}
	var tasksJSON *[]byte
	if req.Tasks != nil {
		b, _ := json.Marshal(req.Tasks)
		tasksJSON = &b
	}
	err := r.pool.QueryRow(ctx,
		`UPDATE installations SET target = COALESCE($3, target), git_repo = COALESCE($4, git_repo),
		 documentation = COALESCE($5, documentation), notes = COALESCE($6, notes), tasks = COALESCE($7, tasks),
		 is_encrypted = COALESCE($8, is_encrypted), iv = COALESCE($9, iv)
		 WHERE id = $1 AND user_id = $2
		 RETURNING id, user_id, guide_id, target, git_repo, documentation, notes, tasks, is_encrypted, iv, created_at, updated_at`,
		id, userID, req.Target, req.GitRepo, req.Documentation, req.Notes, tasksJSON, req.IsEncrypted, req.IV,
	).Scan(&inst.ID, &inst.UserID, &inst.GuideID, &inst.Target, &inst.GitRepo, &inst.Documentation, &inst.Notes, &inst.Tasks, &inst.IsEncrypted, &inst.IV, &inst.CreatedAt, &inst.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("update installation: %w", err)
	}
	return inst, nil
}

func (r *Repo) DeleteInstallation(ctx context.Context, id, userID string) error {
	_, err := r.pool.Exec(ctx, `DELETE FROM installations WHERE id = $1 AND user_id = $2`, id, userID)
	return err
}

// ---- Activity ----

func scanActivityRows(rows pgx.Rows) ([]models.ActivityLog, error) {
	var out []models.ActivityLog
	for rows.Next() {
		var a models.ActivityLog
		if err := rows.Scan(&a.ID, &a.UserID, &a.UserName, &a.Type, &a.EntityType, &a.EntityName, &a.ProjectID, &a.TaskID, &a.Metadata, &a.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	if out == nil {
		out = []models.ActivityLog{}
	}
	return out, nil
}

func (r *Repo) ListActivity(ctx context.Context, userID string) ([]models.ActivityLog, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT a.id, a.user_id, u.name, a.type, a.entity_type, a.entity_name, a.project_id, a.task_id, a.metadata, a.created_at
		 FROM activity a
		 JOIN users u ON u.id = a.user_id
		 WHERE a.user_id = $1
		 ORDER BY a.created_at DESC LIMIT 10`, userID)
	if err != nil {
		return nil, fmt.Errorf("list activity: %w", err)
	}
	defer rows.Close()
	return scanActivityRows(rows)
}

func (r *Repo) ListProjectActivity(ctx context.Context, projectID string, limit int) ([]models.ActivityLog, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT a.id, a.user_id, u.name, a.type, a.entity_type, a.entity_name, a.project_id, a.task_id, a.metadata, a.created_at
		 FROM activity a
		 JOIN users u ON u.id = a.user_id
		 WHERE a.project_id = $1
		 ORDER BY a.created_at DESC
		 LIMIT $2`,
		projectID, limit,
	)
	if err != nil {
		return nil, fmt.Errorf("list project activity: %w", err)
	}
	defer rows.Close()
	return scanActivityRows(rows)
}

func (r *Repo) ListTaskActivity(ctx context.Context, taskID string, limit int) ([]models.ActivityLog, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT a.id, a.user_id, u.name, a.type, a.entity_type, a.entity_name, a.project_id, a.task_id, a.metadata, a.created_at
		 FROM activity a
		 JOIN users u ON u.id = a.user_id
		 WHERE a.task_id = $1
		 ORDER BY a.created_at DESC
		 LIMIT $2`,
		taskID, limit,
	)
	if err != nil {
		return nil, fmt.Errorf("list task activity: %w", err)
	}
	defer rows.Close()
	return scanActivityRows(rows)
}

func (r *Repo) LogActivity(ctx context.Context, userID, actType, entityType, entityName string, projectID, taskID, metadata *string) (*models.ActivityLog, error) {
	a := &models.ActivityLog{}
	err := r.pool.QueryRow(ctx,
		`INSERT INTO activity (user_id, type, entity_type, entity_name, project_id, task_id, metadata)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)
		 RETURNING id, user_id, type, entity_type, entity_name, project_id, task_id, metadata, created_at`,
		userID, actType, entityType, entityName, projectID, taskID, metadata,
	).Scan(&a.ID, &a.UserID, &a.Type, &a.EntityType, &a.EntityName, &a.ProjectID, &a.TaskID, &a.Metadata, &a.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("log activity: %w", err)
	}
	return a, nil
}

// ---- Snippets ----

func (r *Repo) ListSnippets(ctx context.Context, userID string) ([]models.Snippet, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, user_id, title, content, blocks, language, tags, description, is_encrypted, created_at, updated_at FROM snippets WHERE user_id = $1 ORDER BY created_at DESC`, userID)
	if err != nil {
		return nil, fmt.Errorf("list snippets: %w", err)
	}
	defer rows.Close()
	var out []models.Snippet
	for rows.Next() {
		var s models.Snippet
		if err := rows.Scan(&s.ID, &s.UserID, &s.Title, &s.Content, &s.Blocks, &s.Language, &s.Tags, &s.Description, &s.IsEncrypted, &s.CreatedAt, &s.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	if out == nil {
		out = []models.Snippet{}
	}
	return out, nil
}

func (r *Repo) CreateSnippet(ctx context.Context, userID string, req models.CreateSnippetRequest) (*models.Snippet, error) {
	s := &models.Snippet{}
	err := r.pool.QueryRow(ctx,
		`INSERT INTO snippets (user_id, title, content, blocks, language, tags, description, is_encrypted) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		 RETURNING id, user_id, title, content, blocks, language, tags, description, is_encrypted, created_at, updated_at`,
		userID, req.Title, req.Content, req.Blocks, req.Language, req.Tags, req.Description, req.IsEncrypted,
	).Scan(&s.ID, &s.UserID, &s.Title, &s.Content, &s.Blocks, &s.Language, &s.Tags, &s.Description, &s.IsEncrypted, &s.CreatedAt, &s.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("create snippet: %w", err)
	}
	return s, nil
}

func (r *Repo) UpdateSnippet(ctx context.Context, id, userID string, req models.UpdateSnippetRequest) (*models.Snippet, error) {
	s := &models.Snippet{}
	err := r.pool.QueryRow(ctx,
		`UPDATE snippets SET title = COALESCE($3, title), content = COALESCE($4, content), blocks = COALESCE($5, blocks),
		 language = COALESCE($6, language), tags = COALESCE($7, tags), description = COALESCE($8, description), is_encrypted = COALESCE($9, is_encrypted)
		 WHERE id = $1 AND user_id = $2
		 RETURNING id, user_id, title, content, blocks, language, tags, description, is_encrypted, created_at, updated_at`,
		id, userID, req.Title, req.Content, req.Blocks, req.Language, req.Tags, req.Description, req.IsEncrypted,
	).Scan(&s.ID, &s.UserID, &s.Title, &s.Content, &s.Blocks, &s.Language, &s.Tags, &s.Description, &s.IsEncrypted, &s.CreatedAt, &s.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("update snippet: %w", err)
	}
	return s, nil
}

func (r *Repo) DeleteSnippet(ctx context.Context, id, userID string) error {
	_, err := r.pool.Exec(ctx, `DELETE FROM snippets WHERE id = $1 AND user_id = $2`, id, userID)
	return err
}

// ---- User Keys (Vault) ----

func (r *Repo) GetUserKeys(ctx context.Context, userID string) (*models.UserKeys, error) {
	uk := &models.UserKeys{}
	err := r.pool.QueryRow(ctx,
		`SELECT id, user_id, email, public_key, encrypted_private_key, salt, iv, created_at, updated_at FROM user_keys WHERE user_id = $1`, userID,
	).Scan(&uk.ID, &uk.UserID, &uk.Email, &uk.PublicKey, &uk.EncryptedPrivateKey, &uk.Salt, &uk.IV, &uk.CreatedAt, &uk.UpdatedAt)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("get user keys: %w", err)
	}
	return uk, nil
}

func (r *Repo) CreateUserKeys(ctx context.Context, userID, email string, req models.CreateUserKeysRequest) (*models.UserKeys, error) {
	uk := &models.UserKeys{}
	err := r.pool.QueryRow(ctx,
		`INSERT INTO user_keys (user_id, email, public_key, encrypted_private_key, salt, iv) VALUES ($1, $2, $3, $4, $5, $6)
		 RETURNING id, user_id, email, public_key, encrypted_private_key, salt, iv, created_at, updated_at`,
		userID, email, req.PublicKey, req.EncryptedPrivateKey, req.Salt, req.IV,
	).Scan(&uk.ID, &uk.UserID, &uk.Email, &uk.PublicKey, &uk.EncryptedPrivateKey, &uk.Salt, &uk.IV, &uk.CreatedAt, &uk.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("create user keys: %w", err)
	}
	return uk, nil
}

func (r *Repo) UpdateUserKeys(ctx context.Context, id, userID string, req models.UpdateUserKeysRequest) (*models.UserKeys, error) {
	uk := &models.UserKeys{}
	err := r.pool.QueryRow(ctx,
		`UPDATE user_keys SET email = COALESCE($3, email), public_key = COALESCE($4, public_key),
		 encrypted_private_key = COALESCE($5, encrypted_private_key), salt = COALESCE($6, salt), iv = COALESCE($7, iv)
		 WHERE id = $1 AND user_id = $2
		 RETURNING id, user_id, email, public_key, encrypted_private_key, salt, iv, created_at, updated_at`,
		id, userID, req.Email, req.PublicKey, req.EncryptedPrivateKey, req.Salt, req.IV,
	).Scan(&uk.ID, &uk.UserID, &uk.Email, &uk.PublicKey, &uk.EncryptedPrivateKey, &uk.Salt, &uk.IV, &uk.CreatedAt, &uk.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("update user keys: %w", err)
	}
	return uk, nil
}

// ---- Access Control ----

func (r *Repo) GetAccessKey(ctx context.Context, resourceID, userID string) (*models.AccessControl, error) {
	ac := &models.AccessControl{}
	err := r.pool.QueryRow(ctx,
		`SELECT id, resource_id, user_id, encrypted_key, resource_type, created_at, updated_at FROM access_control WHERE resource_id = $1 AND user_id = $2`, resourceID, userID,
	).Scan(&ac.ID, &ac.ResourceID, &ac.UserID, &ac.EncryptedKey, &ac.ResourceType, &ac.CreatedAt, &ac.UpdatedAt)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("get access key: %w", err)
	}
	return ac, nil
}

func (r *Repo) GrantAccess(ctx context.Context, req models.GrantAccessRequest) (*models.AccessControl, error) {
	ac := &models.AccessControl{}
	err := r.pool.QueryRow(ctx,
		`INSERT INTO access_control (resource_id, user_id, encrypted_key, resource_type) VALUES ($1, $2, $3, $4)
		 ON CONFLICT (resource_id, user_id) DO UPDATE SET encrypted_key = EXCLUDED.encrypted_key
		 RETURNING id, resource_id, user_id, encrypted_key, resource_type, created_at, updated_at`,
		req.ResourceID, req.UserID, req.EncryptedKey, req.ResourceType,
	).Scan(&ac.ID, &ac.ResourceID, &ac.UserID, &ac.EncryptedKey, &ac.ResourceType, &ac.CreatedAt, &ac.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("grant access: %w", err)
	}
	return ac, nil
}

func (r *Repo) RemoveAccess(ctx context.Context, resourceID, userID string) error {
	_, err := r.pool.Exec(ctx,
		`DELETE FROM access_control WHERE resource_id = $1 AND user_id = $2`,
		resourceID, userID,
	)
	if err != nil {
		return fmt.Errorf("remove access: %w", err)
	}
	return nil
}

// ---- Resource Versions ----

func (r *Repo) ListVersions(ctx context.Context, resourceID, userID string) ([]models.ResourceVersion, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, user_id, resource_id, resource_type, content, title, metadata, is_encrypted, created_at
		 FROM resource_versions WHERE resource_id = $1 AND user_id = $2 ORDER BY created_at DESC`, resourceID, userID)
	if err != nil {
		return nil, fmt.Errorf("list versions: %w", err)
	}
	defer rows.Close()
	var out []models.ResourceVersion
	for rows.Next() {
		var v models.ResourceVersion
		if err := rows.Scan(&v.ID, &v.UserID, &v.ResourceID, &v.ResourceType, &v.Content, &v.Title, &v.Metadata, &v.IsEncrypted, &v.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	if out == nil {
		out = []models.ResourceVersion{}
	}
	return out, nil
}

func (r *Repo) CreateVersion(ctx context.Context, userID string, req models.CreateVersionRequest) (*models.ResourceVersion, error) {
	v := &models.ResourceVersion{}
	err := r.pool.QueryRow(ctx,
		`INSERT INTO resource_versions (user_id, resource_id, resource_type, content, title, metadata, is_encrypted) VALUES ($1, $2, $3, $4, $5, $6, $7)
		 RETURNING id, user_id, resource_id, resource_type, content, title, metadata, is_encrypted, created_at`,
		userID, req.ResourceID, req.ResourceType, req.Content, req.Title, req.Metadata, req.IsEncrypted,
	).Scan(&v.ID, &v.UserID, &v.ResourceID, &v.ResourceType, &v.Content, &v.Title, &v.Metadata, &v.IsEncrypted, &v.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("create version: %w", err)
	}
	return v, nil
}
