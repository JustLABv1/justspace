package repository

import (
	"context"
	"encoding/json"
	"fmt"

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
		if err == pgx.ErrNoRows { return nil, nil }
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
		if err == pgx.ErrNoRows { return nil, nil }
		return nil, fmt.Errorf("get user by id: %w", err)
	}
	return u, nil
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

// ---- Projects ----

func (r *Repo) ListProjects(ctx context.Context, userID string) ([]models.Project, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, user_id, name, description, status, days_per_week, allocated_days, is_encrypted, created_at, updated_at
		 FROM projects WHERE user_id = $1 ORDER BY created_at DESC`, userID)
	if err != nil { return nil, fmt.Errorf("list projects: %w", err) }
	defer rows.Close()
	var out []models.Project
	for rows.Next() {
		var p models.Project
		if err := rows.Scan(&p.ID, &p.UserID, &p.Name, &p.Description, &p.Status, &p.DaysPerWeek, &p.AllocatedDays, &p.IsEncrypted, &p.CreatedAt, &p.UpdatedAt); err != nil { return nil, err }
		out = append(out, p)
	}
	if out == nil { out = []models.Project{} }
	return out, nil
}

func (r *Repo) GetProject(ctx context.Context, id, userID string) (*models.Project, error) {
	p := &models.Project{}
	err := r.pool.QueryRow(ctx,
		`SELECT id, user_id, name, description, status, days_per_week, allocated_days, is_encrypted, created_at, updated_at
		 FROM projects WHERE id = $1 AND user_id = $2`, id, userID,
	).Scan(&p.ID, &p.UserID, &p.Name, &p.Description, &p.Status, &p.DaysPerWeek, &p.AllocatedDays, &p.IsEncrypted, &p.CreatedAt, &p.UpdatedAt)
	if err != nil {
		if err == pgx.ErrNoRows { return nil, nil }
		return nil, fmt.Errorf("get project: %w", err)
	}
	return p, nil
}

func (r *Repo) CreateProject(ctx context.Context, userID string, req models.CreateProjectRequest) (*models.Project, error) {
	p := &models.Project{}
	err := r.pool.QueryRow(ctx,
		`INSERT INTO projects (user_id, name, description, status, days_per_week, allocated_days, is_encrypted)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)
		 RETURNING id, user_id, name, description, status, days_per_week, allocated_days, is_encrypted, created_at, updated_at`,
		userID, req.Name, req.Description, req.Status, req.DaysPerWeek, req.AllocatedDays, req.IsEncrypted,
	).Scan(&p.ID, &p.UserID, &p.Name, &p.Description, &p.Status, &p.DaysPerWeek, &p.AllocatedDays, &p.IsEncrypted, &p.CreatedAt, &p.UpdatedAt)
	if err != nil { return nil, fmt.Errorf("create project: %w", err) }
	return p, nil
}

func (r *Repo) UpdateProject(ctx context.Context, id, userID string, req models.UpdateProjectRequest) (*models.Project, error) {
	p := &models.Project{}
	err := r.pool.QueryRow(ctx,
		`UPDATE projects SET name = COALESCE($3, name), description = COALESCE($4, description), status = COALESCE($5, status),
		 days_per_week = COALESCE($6, days_per_week), allocated_days = COALESCE($7, allocated_days), is_encrypted = COALESCE($8, is_encrypted)
		 WHERE id = $1 AND user_id = $2
		 RETURNING id, user_id, name, description, status, days_per_week, allocated_days, is_encrypted, created_at, updated_at`,
		id, userID, req.Name, req.Description, req.Status, req.DaysPerWeek, req.AllocatedDays, req.IsEncrypted,
	).Scan(&p.ID, &p.UserID, &p.Name, &p.Description, &p.Status, &p.DaysPerWeek, &p.AllocatedDays, &p.IsEncrypted, &p.CreatedAt, &p.UpdatedAt)
	if err != nil { return nil, fmt.Errorf("update project: %w", err) }
	return p, nil
}

func (r *Repo) DeleteProject(ctx context.Context, id, userID string) error {
	_, err := r.pool.Exec(ctx, `DELETE FROM projects WHERE id = $1 AND user_id = $2`, id, userID)
	return err
}

// ---- Tasks ----

func scanTasks(rows pgx.Rows) ([]models.Task, error) {
	var out []models.Task
	for rows.Next() {
		var t models.Task
		if err := rows.Scan(&t.ID, &t.UserID, &t.ProjectID, &t.Title, &t.Completed, &t.ParentID, &t.TimeSpent, &t.IsTimerRunning, &t.TimerStartedAt, &t.TimeEntries, &t.Order, &t.Priority, &t.KanbanStatus, &t.Deadline, &t.Notes, &t.IsEncrypted, &t.CreatedAt, &t.UpdatedAt); err != nil { return nil, err }
		out = append(out, t)
	}
	if out == nil { out = []models.Task{} }
	return out, nil
}

func (r *Repo) ListTasks(ctx context.Context, projectID, userID string) ([]models.Task, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, user_id, project_id, title, completed, parent_id, time_spent, is_timer_running, timer_started_at, time_entries, sort_order, priority, kanban_status, deadline, notes, is_encrypted, created_at, updated_at
		 FROM tasks WHERE project_id = $1 AND user_id = $2 ORDER BY sort_order ASC`, projectID, userID)
	if err != nil { return nil, fmt.Errorf("list tasks: %w", err) }
	defer rows.Close()
	return scanTasks(rows)
}

func (r *Repo) ListAllTasks(ctx context.Context, userID string, limit int) ([]models.Task, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, user_id, project_id, title, completed, parent_id, time_spent, is_timer_running, timer_started_at, time_entries, sort_order, priority, kanban_status, deadline, notes, is_encrypted, created_at, updated_at
		 FROM tasks WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`, userID, limit)
	if err != nil { return nil, fmt.Errorf("list all tasks: %w", err) }
	defer rows.Close()
	return scanTasks(rows)
}

func (r *Repo) CreateTask(ctx context.Context, userID string, req models.CreateTaskRequest) (*models.Task, error) {
	t := &models.Task{}
	kanban := req.KanbanStatus
	if kanban == "" { kanban = "todo" }
	err := r.pool.QueryRow(ctx,
		`INSERT INTO tasks (user_id, project_id, title, completed, sort_order, priority, kanban_status, is_encrypted, parent_id)
		 VALUES ($1, $2, $3, false, $4, 'medium', $5, $6, $7)
		 RETURNING id, user_id, project_id, title, completed, parent_id, time_spent, is_timer_running, timer_started_at, time_entries, sort_order, priority, kanban_status, deadline, notes, is_encrypted, created_at, updated_at`,
		userID, req.ProjectID, req.Title, req.Order, kanban, req.IsEncrypted, req.ParentID,
	).Scan(&t.ID, &t.UserID, &t.ProjectID, &t.Title, &t.Completed, &t.ParentID, &t.TimeSpent, &t.IsTimerRunning, &t.TimerStartedAt, &t.TimeEntries, &t.Order, &t.Priority, &t.KanbanStatus, &t.Deadline, &t.Notes, &t.IsEncrypted, &t.CreatedAt, &t.UpdatedAt)
	if err != nil { return nil, fmt.Errorf("create task: %w", err) }
	return t, nil
}

func (r *Repo) CreateTasksBatch(ctx context.Context, userID string, req models.CreateTasksBatchRequest) ([]models.Task, error) {
	var startOrder int
	r.pool.QueryRow(ctx, `SELECT COALESCE(MAX(sort_order), -1) + 1 FROM tasks WHERE project_id = $1 AND user_id = $2`, req.ProjectID, userID).Scan(&startOrder)
	var tasks []models.Task
	for i, title := range req.Titles {
		t := &models.Task{}
		err := r.pool.QueryRow(ctx,
			`INSERT INTO tasks (user_id, project_id, title, completed, sort_order, priority, kanban_status, is_encrypted)
			 VALUES ($1, $2, $3, false, $4, 'medium', 'todo', $5)
			 RETURNING id, user_id, project_id, title, completed, parent_id, time_spent, is_timer_running, timer_started_at, time_entries, sort_order, priority, kanban_status, deadline, notes, is_encrypted, created_at, updated_at`,
			userID, req.ProjectID, title, startOrder+i, req.IsEncrypted,
		).Scan(&t.ID, &t.UserID, &t.ProjectID, &t.Title, &t.Completed, &t.ParentID, &t.TimeSpent, &t.IsTimerRunning, &t.TimerStartedAt, &t.TimeEntries, &t.Order, &t.Priority, &t.KanbanStatus, &t.Deadline, &t.Notes, &t.IsEncrypted, &t.CreatedAt, &t.UpdatedAt)
		if err != nil { return nil, fmt.Errorf("create task batch %d: %w", i, err) }
		tasks = append(tasks, *t)
	}
	return tasks, nil
}

func (r *Repo) UpdateTask(ctx context.Context, id, userID string, req models.UpdateTaskRequest) (*models.Task, error) {
	t := &models.Task{}
	err := r.pool.QueryRow(ctx,
		`UPDATE tasks SET
			title = COALESCE($3, title), completed = COALESCE($4, completed), parent_id = COALESCE($5, parent_id),
			time_spent = COALESCE($6, time_spent), is_timer_running = COALESCE($7, is_timer_running),
			timer_started_at = CASE WHEN $8::text IS NOT NULL THEN $8::timestamptz ELSE timer_started_at END,
			time_entries = COALESCE($9, time_entries), sort_order = COALESCE($10, sort_order),
			priority = COALESCE($11, priority), kanban_status = COALESCE($12, kanban_status),
			deadline = CASE WHEN $13::text IS NOT NULL THEN $13::timestamptz ELSE deadline END,
			notes = COALESCE($14, notes), is_encrypted = COALESCE($15, is_encrypted)
		 WHERE id = $1 AND user_id = $2
		 RETURNING id, user_id, project_id, title, completed, parent_id, time_spent, is_timer_running, timer_started_at, time_entries, sort_order, priority, kanban_status, deadline, notes, is_encrypted, created_at, updated_at`,
		id, userID, req.Title, req.Completed, req.ParentID, req.TimeSpent, req.IsTimerRunning, req.TimerStartedAt, req.TimeEntries, req.Order, req.Priority, req.KanbanStatus, req.Deadline, req.Notes, req.IsEncrypted,
	).Scan(&t.ID, &t.UserID, &t.ProjectID, &t.Title, &t.Completed, &t.ParentID, &t.TimeSpent, &t.IsTimerRunning, &t.TimerStartedAt, &t.TimeEntries, &t.Order, &t.Priority, &t.KanbanStatus, &t.Deadline, &t.Notes, &t.IsEncrypted, &t.CreatedAt, &t.UpdatedAt)
	if err != nil { return nil, fmt.Errorf("update task: %w", err) }
	return t, nil
}

func (r *Repo) DeleteTask(ctx context.Context, id, userID string) error {
	_, err := r.pool.Exec(ctx, `DELETE FROM tasks WHERE id = $1 AND user_id = $2`, id, userID)
	return err
}

// ---- Wiki Guides ----

func (r *Repo) ListGuides(ctx context.Context, userID string) ([]models.WikiGuide, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, user_id, title, description, is_encrypted, created_at, updated_at FROM wiki_guides WHERE user_id = $1 ORDER BY created_at DESC`, userID)
	if err != nil { return nil, fmt.Errorf("list guides: %w", err) }
	defer rows.Close()
	var out []models.WikiGuide
	for rows.Next() {
		var g models.WikiGuide
		if err := rows.Scan(&g.ID, &g.UserID, &g.Title, &g.Description, &g.IsEncrypted, &g.CreatedAt, &g.UpdatedAt); err != nil { return nil, err }
		out = append(out, g)
	}
	if out == nil { out = []models.WikiGuide{} }
	return out, nil
}

func (r *Repo) GetGuide(ctx context.Context, id, userID string) (*models.WikiGuide, error) {
	g := &models.WikiGuide{}
	err := r.pool.QueryRow(ctx,
		`SELECT id, user_id, title, description, is_encrypted, created_at, updated_at FROM wiki_guides WHERE id = $1 AND user_id = $2`, id, userID,
	).Scan(&g.ID, &g.UserID, &g.Title, &g.Description, &g.IsEncrypted, &g.CreatedAt, &g.UpdatedAt)
	if err != nil {
		if err == pgx.ErrNoRows { return nil, nil }
		return nil, fmt.Errorf("get guide: %w", err)
	}
	installations, err := r.ListInstallations(ctx, id, userID)
	if err != nil { return nil, err }
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
	if err != nil { return nil, fmt.Errorf("create guide: %w", err) }
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
	if err != nil { return nil, fmt.Errorf("update guide: %w", err) }
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
	if err != nil { return nil, fmt.Errorf("list installations: %w", err) }
	defer rows.Close()
	var out []models.InstallationTarget
	for rows.Next() {
		var i models.InstallationTarget
		if err := rows.Scan(&i.ID, &i.UserID, &i.GuideID, &i.Target, &i.GitRepo, &i.Documentation, &i.Notes, &i.Tasks, &i.IsEncrypted, &i.IV, &i.CreatedAt, &i.UpdatedAt); err != nil { return nil, err }
		out = append(out, i)
	}
	if out == nil { out = []models.InstallationTarget{} }
	return out, nil
}

func (r *Repo) CreateInstallation(ctx context.Context, userID string, req models.CreateInstallationRequest) (*models.InstallationTarget, error) {
	inst := &models.InstallationTarget{}
	tasksJSON, _ := json.Marshal(req.Tasks)
	if req.Tasks == nil { tasksJSON = []byte("[]") }
	err := r.pool.QueryRow(ctx,
		`INSERT INTO installations (user_id, guide_id, target, git_repo, documentation, notes, tasks, is_encrypted, iv)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		 RETURNING id, user_id, guide_id, target, git_repo, documentation, notes, tasks, is_encrypted, iv, created_at, updated_at`,
		userID, req.GuideID, req.Target, req.GitRepo, req.Documentation, req.Notes, tasksJSON, req.IsEncrypted, req.IV,
	).Scan(&inst.ID, &inst.UserID, &inst.GuideID, &inst.Target, &inst.GitRepo, &inst.Documentation, &inst.Notes, &inst.Tasks, &inst.IsEncrypted, &inst.IV, &inst.CreatedAt, &inst.UpdatedAt)
	if err != nil { return nil, fmt.Errorf("create installation: %w", err) }
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
	if err != nil { return nil, fmt.Errorf("update installation: %w", err) }
	return inst, nil
}

func (r *Repo) DeleteInstallation(ctx context.Context, id, userID string) error {
	_, err := r.pool.Exec(ctx, `DELETE FROM installations WHERE id = $1 AND user_id = $2`, id, userID)
	return err
}

// ---- Activity ----

func (r *Repo) ListActivity(ctx context.Context, userID string) ([]models.ActivityLog, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, user_id, type, entity_type, entity_name, project_id, metadata, created_at FROM activity WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10`, userID)
	if err != nil { return nil, fmt.Errorf("list activity: %w", err) }
	defer rows.Close()
	var out []models.ActivityLog
	for rows.Next() {
		var a models.ActivityLog
		if err := rows.Scan(&a.ID, &a.UserID, &a.Type, &a.EntityType, &a.EntityName, &a.ProjectID, &a.Metadata, &a.CreatedAt); err != nil { return nil, err }
		out = append(out, a)
	}
	if out == nil { out = []models.ActivityLog{} }
	return out, nil
}

func (r *Repo) LogActivity(ctx context.Context, userID, actType, entityType, entityName string, projectID *string, metadata *string) (*models.ActivityLog, error) {
	a := &models.ActivityLog{}
	err := r.pool.QueryRow(ctx,
		`INSERT INTO activity (user_id, type, entity_type, entity_name, project_id, metadata) VALUES ($1, $2, $3, $4, $5, $6)
		 RETURNING id, user_id, type, entity_type, entity_name, project_id, metadata, created_at`,
		userID, actType, entityType, entityName, projectID, metadata,
	).Scan(&a.ID, &a.UserID, &a.Type, &a.EntityType, &a.EntityName, &a.ProjectID, &a.Metadata, &a.CreatedAt)
	if err != nil { return nil, fmt.Errorf("log activity: %w", err) }
	return a, nil
}

// ---- Snippets ----

func (r *Repo) ListSnippets(ctx context.Context, userID string) ([]models.Snippet, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, user_id, title, content, blocks, language, tags, description, is_encrypted, created_at, updated_at FROM snippets WHERE user_id = $1 ORDER BY created_at DESC`, userID)
	if err != nil { return nil, fmt.Errorf("list snippets: %w", err) }
	defer rows.Close()
	var out []models.Snippet
	for rows.Next() {
		var s models.Snippet
		if err := rows.Scan(&s.ID, &s.UserID, &s.Title, &s.Content, &s.Blocks, &s.Language, &s.Tags, &s.Description, &s.IsEncrypted, &s.CreatedAt, &s.UpdatedAt); err != nil { return nil, err }
		out = append(out, s)
	}
	if out == nil { out = []models.Snippet{} }
	return out, nil
}

func (r *Repo) CreateSnippet(ctx context.Context, userID string, req models.CreateSnippetRequest) (*models.Snippet, error) {
	s := &models.Snippet{}
	err := r.pool.QueryRow(ctx,
		`INSERT INTO snippets (user_id, title, content, blocks, language, tags, description, is_encrypted) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		 RETURNING id, user_id, title, content, blocks, language, tags, description, is_encrypted, created_at, updated_at`,
		userID, req.Title, req.Content, req.Blocks, req.Language, req.Tags, req.Description, req.IsEncrypted,
	).Scan(&s.ID, &s.UserID, &s.Title, &s.Content, &s.Blocks, &s.Language, &s.Tags, &s.Description, &s.IsEncrypted, &s.CreatedAt, &s.UpdatedAt)
	if err != nil { return nil, fmt.Errorf("create snippet: %w", err) }
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
	if err != nil { return nil, fmt.Errorf("update snippet: %w", err) }
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
		if err == pgx.ErrNoRows { return nil, nil }
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
	if err != nil { return nil, fmt.Errorf("create user keys: %w", err) }
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
	if err != nil { return nil, fmt.Errorf("update user keys: %w", err) }
	return uk, nil
}

// ---- Access Control ----

func (r *Repo) GetAccessKey(ctx context.Context, resourceID, userID string) (*models.AccessControl, error) {
	ac := &models.AccessControl{}
	err := r.pool.QueryRow(ctx,
		`SELECT id, resource_id, user_id, encrypted_key, resource_type, created_at, updated_at FROM access_control WHERE resource_id = $1 AND user_id = $2`, resourceID, userID,
	).Scan(&ac.ID, &ac.ResourceID, &ac.UserID, &ac.EncryptedKey, &ac.ResourceType, &ac.CreatedAt, &ac.UpdatedAt)
	if err != nil {
		if err == pgx.ErrNoRows { return nil, nil }
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
	if err != nil { return nil, fmt.Errorf("grant access: %w", err) }
	return ac, nil
}

// ---- Resource Versions ----

func (r *Repo) ListVersions(ctx context.Context, resourceID, userID string) ([]models.ResourceVersion, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, user_id, resource_id, resource_type, content, title, metadata, is_encrypted, created_at
		 FROM resource_versions WHERE resource_id = $1 AND user_id = $2 ORDER BY created_at DESC`, resourceID, userID)
	if err != nil { return nil, fmt.Errorf("list versions: %w", err) }
	defer rows.Close()
	var out []models.ResourceVersion
	for rows.Next() {
		var v models.ResourceVersion
		if err := rows.Scan(&v.ID, &v.UserID, &v.ResourceID, &v.ResourceType, &v.Content, &v.Title, &v.Metadata, &v.IsEncrypted, &v.CreatedAt); err != nil { return nil, err }
		out = append(out, v)
	}
	if out == nil { out = []models.ResourceVersion{} }
	return out, nil
}

func (r *Repo) CreateVersion(ctx context.Context, userID string, req models.CreateVersionRequest) (*models.ResourceVersion, error) {
	v := &models.ResourceVersion{}
	err := r.pool.QueryRow(ctx,
		`INSERT INTO resource_versions (user_id, resource_id, resource_type, content, title, metadata, is_encrypted) VALUES ($1, $2, $3, $4, $5, $6, $7)
		 RETURNING id, user_id, resource_id, resource_type, content, title, metadata, is_encrypted, created_at`,
		userID, req.ResourceID, req.ResourceType, req.Content, req.Title, req.Metadata, req.IsEncrypted,
	).Scan(&v.ID, &v.UserID, &v.ResourceID, &v.ResourceType, &v.Content, &v.Title, &v.Metadata, &v.IsEncrypted, &v.CreatedAt)
	if err != nil { return nil, fmt.Errorf("create version: %w", err) }
	return v, nil
}
