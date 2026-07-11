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
	"github.com/jackc/pgx/v5/pgconn"
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
	p.task_key_prefix, (p.next_task_number > 1) AS task_key_prefix_locked, pm.role, p.created_at, p.updated_at, p.workspace_id
	FROM projects p
	JOIN project_members pm ON pm.project_id = p.id
	WHERE pm.user_id = $1`

const taskSelectColumns = `id, user_id, project_id, task_number, task_key, title, description, completed, parent_id, time_spent, is_timer_running, timer_started_at, time_entries, sort_order, priority, kanban_status, deadline, tags, dependencies, recurrence, is_encrypted, created_at, updated_at`

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
		&project.WorkspaceID,
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

func projectTaskKeyPrefixFallback(value string) string {
	var encryptedPayload struct {
		Ciphertext string `json:"ciphertext"`
		IV         string `json:"iv"`
	}
	if json.Unmarshal([]byte(value), &encryptedPayload) == nil && encryptedPayload.Ciphertext != "" && encryptedPayload.IV != "" {
		return "PRJ"
	}
	return value
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
		base = projectTaskKeyPrefixFallback(fallbackName)
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
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin create user: %w", err)
	}
	defer tx.Rollback(ctx)

	// Serialise the first-user decision across concurrent local and OIDC signups.
	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtextextended('justspace:first-platform-admin', 0))`); err != nil {
		return nil, fmt.Errorf("lock first user creation: %w", err)
	}
	var userCount int
	if err := tx.QueryRow(ctx, `SELECT COUNT(*) FROM users`).Scan(&userCount); err != nil {
		return nil, fmt.Errorf("count users: %w", err)
	}
	u := &models.User{}
	err = tx.QueryRow(ctx,
		`INSERT INTO users (email, name, password_hash, is_platform_admin)
		 VALUES ($1, $2, NULLIF($3, ''), $4)
		 RETURNING id, email, name, preferences, is_platform_admin, is_active, session_version, created_at, updated_at`,
		email, name, passwordHash, userCount == 0,
	).Scan(&u.ID, &u.Email, &u.Name, &u.Preferences, &u.IsPlatformAdmin, &u.IsActive, &u.SessionVersion, &u.CreatedAt, &u.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("create user: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit create user: %w", err)
	}
	return u, nil
}

func (r *Repo) GetUserByEmail(ctx context.Context, email string) (*models.User, error) {
	u := &models.User{}
	var passwordHash *string
	err := r.pool.QueryRow(ctx,
		`SELECT id, email, name, password_hash, preferences, is_platform_admin, is_active, session_version, created_at, updated_at FROM users WHERE email = $1`, email,
	).Scan(&u.ID, &u.Email, &u.Name, &passwordHash, &u.Preferences, &u.IsPlatformAdmin, &u.IsActive, &u.SessionVersion, &u.CreatedAt, &u.UpdatedAt)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("get user by email: %w", err)
	}
	if passwordHash != nil {
		u.PasswordHash = *passwordHash
	}
	return u, nil
}

func (r *Repo) GetUserByID(ctx context.Context, id string) (*models.User, error) {
	u := &models.User{}
	var passwordHash *string
	err := r.pool.QueryRow(ctx,
		`SELECT id, email, name, password_hash, preferences, is_platform_admin, is_active, session_version, created_at, updated_at FROM users WHERE id = $1`, id,
	).Scan(&u.ID, &u.Email, &u.Name, &passwordHash, &u.Preferences, &u.IsPlatformAdmin, &u.IsActive, &u.SessionVersion, &u.CreatedAt, &u.UpdatedAt)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("get user by id: %w", err)
	}
	if passwordHash != nil {
		u.PasswordHash = *passwordHash
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
		`UPDATE users SET name = COALESCE($2, name), preferences = COALESCE($3, preferences), updated_at = NOW()
		 WHERE id = $1 RETURNING id, email, name, preferences, is_platform_admin, is_active, session_version, created_at, updated_at`,
		id, name, prefs,
	).Scan(&u.ID, &u.Email, &u.Name, &u.Preferences, &u.IsPlatformAdmin, &u.IsActive, &u.SessionVersion, &u.CreatedAt, &u.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("update user: %w", err)
	}
	return u, nil
}

// GetUserAuthState is deliberately small so the auth middleware can invalidate
// sessions immediately after an admin deactivates an account or changes its
// platform privileges.
func (r *Repo) GetUserAuthState(ctx context.Context, id string) (bool, int64, error) {
	var active bool
	var version int64
	err := r.pool.QueryRow(ctx, `SELECT is_active, session_version FROM users WHERE id = $1`, id).Scan(&active, &version)
	if err == pgx.ErrNoRows {
		return false, 0, nil
	}
	if err != nil {
		return false, 0, fmt.Errorf("get user auth state: %w", err)
	}
	return active, version, nil
}

func (r *Repo) GetPlatformSettings(ctx context.Context) (*models.PlatformSettings, error) {
	settings := &models.PlatformSettings{}
	err := r.pool.QueryRow(ctx, `SELECT local_auth_enabled, brand_name, brand_logo_key, brand_logo_updated_at FROM platform_settings WHERE id = TRUE`).Scan(&settings.LocalAuthEnabled, &settings.BrandName, &settings.BrandLogoKey, &settings.BrandLogoUpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("get platform settings: %w", err)
	}
	return settings, nil
}

func (r *Repo) UpdatePlatformSettings(ctx context.Context, req models.PlatformSettingsUpdateRequest) (*models.PlatformSettings, error) {
	settings := &models.PlatformSettings{}
	err := r.pool.QueryRow(ctx,
		`UPDATE platform_settings
		 SET local_auth_enabled = COALESCE($1, local_auth_enabled),
		     brand_name = COALESCE($2, brand_name), updated_at = NOW()
		 WHERE id = TRUE
		 RETURNING local_auth_enabled, brand_name, brand_logo_key, brand_logo_updated_at`, req.LocalAuthEnabled, req.BrandName,
	).Scan(&settings.LocalAuthEnabled, &settings.BrandName, &settings.BrandLogoKey, &settings.BrandLogoUpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("update platform settings: %w", err)
	}
	return settings, nil
}

func (r *Repo) UpdateBrandLogoKey(ctx context.Context, key *string) (*models.PlatformSettings, error) {
	var commandTag pgconn.CommandTag
	var err error
	if key == nil {
		commandTag, err = r.pool.Exec(ctx,
			`UPDATE platform_settings
			 SET brand_logo_key = NULL, brand_logo_updated_at = NULL, updated_at = NOW()
			 WHERE id = TRUE`,
		)
	} else {
		commandTag, err = r.pool.Exec(ctx,
			`UPDATE platform_settings
			 SET brand_logo_key = $1, brand_logo_updated_at = NOW(), updated_at = NOW()
			 WHERE id = TRUE`,
			*key,
		)
	}
	if err != nil {
		return nil, fmt.Errorf("update brand logo key: %w", err)
	}
	if commandTag.RowsAffected() != 1 {
		return nil, fmt.Errorf("update brand logo key: platform settings row not found")
	}
	return r.GetPlatformSettings(ctx)
}

func (r *Repo) GetAdminOverview(ctx context.Context) (*models.AdminOverview, error) {
	overview := &models.AdminOverview{DatabaseStatus: "healthy"}
	if err := r.pool.QueryRow(ctx, `SELECT 1`).Scan(new(int)); err != nil {
		overview.DatabaseStatus = "unhealthy"
	}
	if err := r.pool.QueryRow(ctx, `SELECT COUNT(*), COUNT(*) FILTER (WHERE is_active), COUNT(*) FILTER (WHERE NOT is_active), COUNT(*) FILTER (WHERE is_platform_admin) FROM users`).Scan(&overview.TotalUsers, &overview.ActiveUsers, &overview.InactiveUsers, &overview.PlatformAdmins); err != nil {
		return nil, fmt.Errorf("get overview users: %w", err)
	}
	if err := r.pool.QueryRow(ctx, `SELECT COUNT(*) FROM projects`).Scan(&overview.Projects); err != nil {
		return nil, fmt.Errorf("get overview projects: %w", err)
	}
	if err := r.pool.QueryRow(ctx, `SELECT COUNT(*) FROM tasks`).Scan(&overview.Tasks); err != nil {
		return nil, fmt.Errorf("get overview tasks: %w", err)
	}
	if err := r.pool.QueryRow(ctx, `SELECT COUNT(*), COUNT(*) FILTER (WHERE enabled) FROM oidc_providers`).Scan(&overview.TotalOIDCProviders, &overview.EnabledOIDCProviders); err != nil {
		return nil, fmt.Errorf("get overview oidc providers: %w", err)
	}
	settings, err := r.GetPlatformSettings(ctx)
	if err != nil {
		return nil, err
	}
	overview.LocalAuthEnabled = settings.LocalAuthEnabled
	return overview, nil
}

func (r *Repo) CreateAdminAudit(ctx context.Context, actorID, action, targetType, targetID, targetLabel string, metadata json.RawMessage) error {
	if len(metadata) == 0 {
		metadata = json.RawMessage(`{}`)
	}
	var nullableTargetID *string
	if strings.TrimSpace(targetID) != "" {
		nullableTargetID = &targetID
	}
	_, err := r.pool.Exec(ctx,
		`INSERT INTO admin_audit_log (actor_user_id, action, target_type, target_id, target_label, metadata)
		 VALUES ($1, $2, $3, $4::uuid, $5, $6)`, actorID, action, targetType, nullableTargetID, targetLabel, metadata)
	return err
}

func (r *Repo) ListAdminAudit(ctx context.Context, limit, offset int) ([]models.AdminAuditEvent, int, error) {
	var total int
	if err := r.pool.QueryRow(ctx, `SELECT COUNT(*) FROM admin_audit_log`).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count admin audit: %w", err)
	}
	rows, err := r.pool.Query(ctx,
		`SELECT a.id, a.actor_user_id, COALESCE(u.name, ''), COALESCE(u.email, ''), a.action, a.target_type, a.target_id, a.target_label, a.metadata, a.created_at
		 FROM admin_audit_log a LEFT JOIN users u ON u.id = a.actor_user_id
		 ORDER BY a.created_at DESC LIMIT $1 OFFSET $2`, limit, offset)
	if err != nil {
		return nil, 0, fmt.Errorf("list admin audit: %w", err)
	}
	defer rows.Close()
	events := make([]models.AdminAuditEvent, 0)
	for rows.Next() {
		var event models.AdminAuditEvent
		if err := rows.Scan(&event.ID, &event.ActorUserID, &event.ActorName, &event.ActorEmail, &event.Action, &event.TargetType, &event.TargetID, &event.TargetLabel, &event.Metadata, &event.CreatedAt); err != nil {
			return nil, 0, fmt.Errorf("scan admin audit: %w", err)
		}
		events = append(events, event)
	}
	return events, total, rows.Err()
}

func (r *Repo) DeleteExpiredAdminAudit(ctx context.Context) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin audit retention: %w", err)
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, `SELECT set_config('justspace.audit_cleanup', 'on', true)`); err != nil {
		return fmt.Errorf("enable audit cleanup: %w", err)
	}
	if _, err := tx.Exec(ctx, `DELETE FROM admin_audit_log WHERE created_at < NOW() - INTERVAL '12 months'`); err != nil {
		return fmt.Errorf("delete expired admin audit: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit audit retention: %w", err)
	}
	return nil
}

func (r *Repo) CountEnabledOIDCProviders(ctx context.Context) (int, error) {
	var count int
	if err := r.pool.QueryRow(ctx, `SELECT COUNT(*) FROM oidc_providers WHERE enabled = TRUE`).Scan(&count); err != nil {
		return 0, fmt.Errorf("count enabled oidc providers: %w", err)
	}
	return count, nil
}

func (r *Repo) ListAdminUsers(ctx context.Context, query string, limit, offset int) ([]models.AdminUser, int, error) {
	pattern := "%" + strings.TrimSpace(query) + "%"
	var total int
	if err := r.pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM users WHERE email ILIKE $1 OR name ILIKE $1`, pattern).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count admin users: %w", err)
	}
	rows, err := r.pool.Query(ctx,
		`SELECT id, email, name, is_platform_admin, is_active, created_at, updated_at
		 FROM users WHERE email ILIKE $1 OR name ILIKE $1
		 ORDER BY created_at ASC, id ASC LIMIT $2 OFFSET $3`, pattern, limit, offset)
	if err != nil {
		return nil, 0, fmt.Errorf("list admin users: %w", err)
	}
	defer rows.Close()
	users := make([]models.AdminUser, 0)
	for rows.Next() {
		var user models.AdminUser
		if err := rows.Scan(&user.ID, &user.Email, &user.Name, &user.IsPlatformAdmin, &user.IsActive, &user.CreatedAt, &user.UpdatedAt); err != nil {
			return nil, 0, fmt.Errorf("scan admin user: %w", err)
		}
		users = append(users, user)
	}
	return users, total, rows.Err()
}

func (r *Repo) UpdateAdminUser(ctx context.Context, actorID, targetID string, req models.AdminUserUpdateRequest) (*models.AdminUser, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin admin user update: %w", err)
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtextextended('justspace:platform-admins', 0))`); err != nil {
		return nil, fmt.Errorf("lock platform admin update: %w", err)
	}

	var current models.AdminUser
	err = tx.QueryRow(ctx,
		`SELECT id, email, name, is_platform_admin, is_active, created_at, updated_at
		 FROM users WHERE id = $1 FOR UPDATE`, targetID,
	).Scan(&current.ID, &current.Email, &current.Name, &current.IsPlatformAdmin, &current.IsActive, &current.CreatedAt, &current.UpdatedAt)
	if err == pgx.ErrNoRows {
		return nil, fmt.Errorf("user not found")
	}
	if err != nil {
		return nil, fmt.Errorf("lock admin user: %w", err)
	}
	if actorID == targetID && ((req.IsActive != nil && !*req.IsActive) || (req.IsPlatformAdmin != nil && !*req.IsPlatformAdmin)) {
		return nil, fmt.Errorf("you cannot remove your own active admin access")
	}
	wouldBeAdmin := current.IsPlatformAdmin
	if req.IsPlatformAdmin != nil {
		wouldBeAdmin = *req.IsPlatformAdmin
	}
	wouldBeActive := current.IsActive
	if req.IsActive != nil {
		wouldBeActive = *req.IsActive
	}
	if current.IsPlatformAdmin && current.IsActive && (!wouldBeAdmin || !wouldBeActive) {
		var activeAdmins int
		if err := tx.QueryRow(ctx, `SELECT COUNT(*) FROM users WHERE is_platform_admin = TRUE AND is_active = TRUE`).Scan(&activeAdmins); err != nil {
			return nil, fmt.Errorf("count active admins: %w", err)
		}
		if activeAdmins <= 1 {
			return nil, fmt.Errorf("the last active platform admin cannot be removed")
		}
	}
	if _, err := tx.Exec(ctx,
		`UPDATE users SET is_platform_admin = COALESCE($2, is_platform_admin),
		 is_active = COALESCE($3, is_active), session_version = session_version + 1, updated_at = NOW()
		 WHERE id = $1`, targetID, req.IsPlatformAdmin, req.IsActive); err != nil {
		return nil, fmt.Errorf("update admin user: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit admin user update: %w", err)
	}
	current.IsPlatformAdmin = wouldBeAdmin
	current.IsActive = wouldBeActive
	return &current, nil
}

func (r *Repo) ListOIDCProviders(ctx context.Context, includeDisabled bool) ([]models.OIDCProvider, error) {
	query := `SELECT id, slug, name, issuer_url, client_id, client_secret, enabled, created_at, updated_at FROM oidc_providers`
	args := []any{}
	if !includeDisabled {
		query += ` WHERE enabled = TRUE`
	}
	query += ` ORDER BY name ASC`
	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("list oidc providers: %w", err)
	}
	defer rows.Close()
	providers := make([]models.OIDCProvider, 0)
	for rows.Next() {
		var provider models.OIDCProvider
		if err := rows.Scan(&provider.ID, &provider.Slug, &provider.Name, &provider.IssuerURL, &provider.ClientID, &provider.ClientSecret, &provider.Enabled, &provider.CreatedAt, &provider.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan oidc provider: %w", err)
		}
		provider.HasSecret = provider.ClientSecret != ""
		provider.ClientSecret = ""
		providers = append(providers, provider)
	}
	return providers, rows.Err()
}

func (r *Repo) GetOIDCProviderBySlug(ctx context.Context, slug string) (*models.OIDCProvider, error) {
	provider := &models.OIDCProvider{}
	err := r.pool.QueryRow(ctx,
		`SELECT id, slug, name, issuer_url, client_id, client_secret, enabled, created_at, updated_at
		 FROM oidc_providers WHERE slug = $1`, slug,
	).Scan(&provider.ID, &provider.Slug, &provider.Name, &provider.IssuerURL, &provider.ClientID, &provider.ClientSecret, &provider.Enabled, &provider.CreatedAt, &provider.UpdatedAt)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get oidc provider: %w", err)
	}
	provider.HasSecret = provider.ClientSecret != ""
	return provider, nil
}

func (r *Repo) GetOIDCProviderByID(ctx context.Context, id string) (*models.OIDCProvider, error) {
	provider := &models.OIDCProvider{}
	err := r.pool.QueryRow(ctx,
		`SELECT id, slug, name, issuer_url, client_id, client_secret, enabled, created_at, updated_at
		 FROM oidc_providers WHERE id = $1`, id,
	).Scan(&provider.ID, &provider.Slug, &provider.Name, &provider.IssuerURL, &provider.ClientID, &provider.ClientSecret, &provider.Enabled, &provider.CreatedAt, &provider.UpdatedAt)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get oidc provider: %w", err)
	}
	provider.HasSecret = provider.ClientSecret != ""
	return provider, nil
}

func (r *Repo) CreateOIDCProvider(ctx context.Context, req models.OIDCProviderRequest, encryptedSecret string) (*models.OIDCProvider, error) {
	enabled := true
	if req.Enabled != nil {
		enabled = *req.Enabled
	}
	provider := &models.OIDCProvider{}
	err := r.pool.QueryRow(ctx,
		`INSERT INTO oidc_providers (slug, name, issuer_url, client_id, client_secret, enabled)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 RETURNING id, slug, name, issuer_url, client_id, client_secret, enabled, created_at, updated_at`,
		req.Slug, req.Name, req.IssuerURL, req.ClientID, encryptedSecret, enabled,
	).Scan(&provider.ID, &provider.Slug, &provider.Name, &provider.IssuerURL, &provider.ClientID, &provider.ClientSecret, &provider.Enabled, &provider.CreatedAt, &provider.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("create oidc provider: %w", err)
	}
	provider.HasSecret = provider.ClientSecret != ""
	provider.ClientSecret = ""
	return provider, nil
}

func (r *Repo) UpdateOIDCProvider(ctx context.Context, id string, req models.OIDCProviderRequest, encryptedSecret *string) (*models.OIDCProvider, error) {
	provider := &models.OIDCProvider{}
	err := r.pool.QueryRow(ctx,
		`UPDATE oidc_providers SET slug = $2, name = $3, issuer_url = $4, client_id = $5,
		 client_secret = COALESCE($6, client_secret), enabled = COALESCE($7, enabled), updated_at = NOW()
		 WHERE id = $1
		 RETURNING id, slug, name, issuer_url, client_id, client_secret, enabled, created_at, updated_at`,
		id, req.Slug, req.Name, req.IssuerURL, req.ClientID, encryptedSecret, req.Enabled,
	).Scan(&provider.ID, &provider.Slug, &provider.Name, &provider.IssuerURL, &provider.ClientID, &provider.ClientSecret, &provider.Enabled, &provider.CreatedAt, &provider.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("update oidc provider: %w", err)
	}
	provider.HasSecret = provider.ClientSecret != ""
	provider.ClientSecret = ""
	return provider, nil
}

func (r *Repo) DeleteOIDCProvider(ctx context.Context, id string) error {
	var identityCount int
	if err := r.pool.QueryRow(ctx, `SELECT COUNT(*) FROM user_oidc_identities WHERE provider_id = $1`, id).Scan(&identityCount); err != nil {
		return fmt.Errorf("count oidc identities: %w", err)
	}
	if identityCount > 0 {
		return fmt.Errorf("provider has linked identities; disable it instead")
	}
	_, err := r.pool.Exec(ctx, `DELETE FROM oidc_providers WHERE id = $1`, id)
	return err
}

func (r *Repo) GetOIDCIdentity(ctx context.Context, providerID, subject string) (*models.OIDCIdentity, error) {
	identity := &models.OIDCIdentity{}
	err := r.pool.QueryRow(ctx,
		`SELECT i.id, i.user_id, i.provider_id, p.name, p.slug, i.subject, i.created_at
		 FROM user_oidc_identities i JOIN oidc_providers p ON p.id = i.provider_id
		 WHERE i.provider_id = $1 AND i.subject = $2`, providerID, subject,
	).Scan(&identity.ID, &identity.UserID, &identity.ProviderID, &identity.ProviderName, &identity.ProviderSlug, &identity.Subject, &identity.CreatedAt)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get oidc identity: %w", err)
	}
	return identity, nil
}

func (r *Repo) ListOIDCIdentities(ctx context.Context, userID string) ([]models.OIDCIdentity, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT i.id, i.user_id, i.provider_id, p.name, p.slug, i.subject, i.created_at
		 FROM user_oidc_identities i JOIN oidc_providers p ON p.id = i.provider_id
		 WHERE i.user_id = $1 ORDER BY p.name ASC`, userID)
	if err != nil {
		return nil, fmt.Errorf("list oidc identities: %w", err)
	}
	defer rows.Close()
	identities := make([]models.OIDCIdentity, 0)
	for rows.Next() {
		var identity models.OIDCIdentity
		if err := rows.Scan(&identity.ID, &identity.UserID, &identity.ProviderID, &identity.ProviderName, &identity.ProviderSlug, &identity.Subject, &identity.CreatedAt); err != nil {
			return nil, err
		}
		identities = append(identities, identity)
	}
	return identities, rows.Err()
}

func (r *Repo) CreateOIDCIdentity(ctx context.Context, userID, providerID, subject string) error {
	_, err := r.pool.Exec(ctx,
		`INSERT INTO user_oidc_identities (user_id, provider_id, subject) VALUES ($1, $2, $3)`, userID, providerID, subject)
	return err
}

func (r *Repo) DeleteOIDCIdentity(ctx context.Context, userID, identityID string) error {
	var count int
	var hasPassword bool
	if err := r.pool.QueryRow(ctx, `SELECT COUNT(*), EXISTS(SELECT 1 FROM users WHERE id = $1 AND password_hash IS NOT NULL) FROM user_oidc_identities WHERE user_id = $1`, userID).Scan(&count, &hasPassword); err != nil {
		return err
	}
	if count <= 1 && !hasPassword {
		return fmt.Errorf("at least one login identity must remain")
	}
	_, err := r.pool.Exec(ctx, `DELETE FROM user_oidc_identities WHERE id = $1 AND user_id = $2`, identityID, userID)
	return err
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

// ---- Workspaces ----

func scanWorkspace(row pgx.Row, workspace *models.Workspace) error {
	return row.Scan(&workspace.ID, &workspace.OwnerID, &workspace.Name, &workspace.Slug, &workspace.Role, &workspace.AutoAddMembersToProjects, &workspace.CreatedAt, &workspace.UpdatedAt)
}

func (r *Repo) GetDefaultWorkspaceID(ctx context.Context, userID string) (string, error) {
	var id string
	err := r.pool.QueryRow(ctx, `
		SELECT w.id
		FROM workspaces w
		JOIN workspace_members wm ON wm.workspace_id = w.id
		WHERE wm.user_id = $1
		ORDER BY w.created_at ASC
		LIMIT 1`, userID).Scan(&id)
	if err == pgx.ErrNoRows {
		return "", fmt.Errorf("workspace not found for user %s", userID)
	}
	return id, err
}

func (r *Repo) CanAccessWorkspace(ctx context.Context, workspaceID, userID string) (bool, error) {
	var exists bool
	err := r.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM workspace_members WHERE workspace_id = $1 AND user_id = $2)`, workspaceID, userID).Scan(&exists)
	return exists, err
}

func (r *Repo) ListWorkspaces(ctx context.Context, userID string) ([]models.Workspace, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT w.id, w.owner_user_id, w.name, w.slug, wm.role, w.auto_add_members_to_projects, w.created_at, w.updated_at
		FROM workspaces w
		JOIN workspace_members wm ON wm.workspace_id = w.id AND wm.user_id = $1
		ORDER BY w.name ASC`, userID)
	if err != nil {
		return nil, fmt.Errorf("list workspaces: %w", err)
	}
	defer rows.Close()
	workspaces := make([]models.Workspace, 0)
	for rows.Next() {
		var workspace models.Workspace
		if err := rows.Scan(&workspace.ID, &workspace.OwnerID, &workspace.Name, &workspace.Slug, &workspace.Role, &workspace.CreatedAt, &workspace.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan workspace: %w", err)
		}
		workspaces = append(workspaces, workspace)
	}
	return workspaces, rows.Err()
}

func (r *Repo) CreateWorkspace(ctx context.Context, userID string, req models.CreateWorkspaceRequest) (*models.Workspace, error) {
	name := strings.TrimSpace(req.Name)
	if name == "" {
		return nil, fmt.Errorf("workspace name is required")
	}
	slug := normalizeStatusKey(name)
	if slug == "" {
		slug = "workspace"
	}
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin create workspace: %w", err)
	}
	defer tx.Rollback(ctx)
	workspace := &models.Workspace{}
	err = tx.QueryRow(ctx, `
		INSERT INTO workspaces (owner_user_id, name, slug)
		VALUES ($1, $2, $3 || '-' || LEFT(REPLACE(gen_random_uuid()::text, '-', ''), 6))
			RETURNING id, owner_user_id, name, slug, 'owner', auto_add_members_to_projects, created_at, updated_at`, userID, name, slug).Scan(
		&workspace.ID, &workspace.OwnerID, &workspace.Name, &workspace.Slug, &workspace.Role, &workspace.AutoAddMembersToProjects, &workspace.CreatedAt, &workspace.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("create workspace: %w", err)
	}
	if _, err := tx.Exec(ctx, `INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'owner')`, workspace.ID, userID); err != nil {
		return nil, fmt.Errorf("create workspace owner membership: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit create workspace: %w", err)
	}
	return workspace, nil
}

func (r *Repo) UpdateWorkspace(ctx context.Context, id, userID string, req models.UpdateWorkspaceRequest) (*models.Workspace, error) {
	workspace := &models.Workspace{}
	err := r.pool.QueryRow(ctx, `
		UPDATE workspaces w
		SET name = COALESCE($3, w.name),
			auto_add_members_to_projects = COALESCE($4, w.auto_add_members_to_projects)
		WHERE w.id = $1 AND EXISTS (
			SELECT 1 FROM workspace_members wm WHERE wm.workspace_id = w.id AND wm.user_id = $2 AND wm.role IN ('owner', 'admin')
		)
		RETURNING w.id, w.owner_user_id, w.name, w.slug,
			(SELECT wm.role FROM workspace_members wm WHERE wm.workspace_id = w.id AND wm.user_id = $2),
			w.auto_add_members_to_projects, w.created_at, w.updated_at`, id, userID, req.Name, req.AutoAddMembersToProjects).Scan(
		&workspace.ID, &workspace.OwnerID, &workspace.Name, &workspace.Slug, &workspace.Role, &workspace.AutoAddMembersToProjects, &workspace.CreatedAt, &workspace.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("update workspace: %w", err)
	}
	return workspace, nil
}

func (r *Repo) GetWorkspaceRole(ctx context.Context, workspaceID, userID string) (string, error) {
	var role string
	err := r.pool.QueryRow(ctx,
		`SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`, workspaceID, userID).Scan(&role)
	if err != nil {
		if err == pgx.ErrNoRows {
			return "", nil
		}
		return "", fmt.Errorf("get workspace role: %w", err)
	}
	return role, nil
}

func (r *Repo) ListWorkspaceMembers(ctx context.Context, workspaceID string) ([]models.WorkspaceMember, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT wm.workspace_id, wm.user_id, u.name, u.email, wm.role, wm.joined_at, uk.public_key, uk.user_id IS NOT NULL
		 FROM workspace_members wm
		 JOIN users u ON u.id = wm.user_id
		 LEFT JOIN user_keys uk ON uk.user_id = wm.user_id
		 WHERE wm.workspace_id = $1
		 ORDER BY CASE wm.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'member' THEN 2 ELSE 3 END, u.name ASC`, workspaceID)
	if err != nil {
		return nil, fmt.Errorf("list workspace members: %w", err)
	}
	defer rows.Close()
	members := make([]models.WorkspaceMember, 0)
	for rows.Next() {
		var member models.WorkspaceMember
		if err := rows.Scan(&member.WorkspaceID, &member.UserID, &member.Name, &member.Email, &member.Role, &member.JoinedAt, &member.PublicKey, &member.HasVault); err != nil {
			return nil, fmt.Errorf("scan workspace member: %w", err)
		}
		members = append(members, member)
	}
	return members, rows.Err()
}

func (r *Repo) CreateWorkspaceMember(ctx context.Context, workspaceID, userID, role string) (*models.WorkspaceMember, error) {
	member := &models.WorkspaceMember{}
	err := r.pool.QueryRow(ctx,
		`INSERT INTO workspace_members (workspace_id, user_id, role)
		 VALUES ($1, $2, $3)
		 RETURNING workspace_id, user_id, joined_at`, workspaceID, userID, role).Scan(&member.WorkspaceID, &member.UserID, &member.JoinedAt)
	if err != nil {
		return nil, fmt.Errorf("create workspace member: %w", err)
	}
	user, err := r.GetUserByID(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("load workspace member user: %w", err)
	}
	if user == nil {
		return nil, fmt.Errorf("workspace member user not found")
	}
	member.Name = user.Name
	member.Email = user.Email
	member.Role = role
	return member, nil
}

func (r *Repo) UpdateWorkspaceMemberRole(ctx context.Context, workspaceID, userID, role string) (*models.WorkspaceMember, error) {
	member := &models.WorkspaceMember{}
	err := r.pool.QueryRow(ctx,
		`UPDATE workspace_members wm
		 SET role = $3
		 WHERE wm.workspace_id = $1 AND wm.user_id = $2 AND wm.role <> 'owner'
		 RETURNING wm.workspace_id, wm.user_id, wm.role, wm.joined_at`, workspaceID, userID, role).
		Scan(&member.WorkspaceID, &member.UserID, &member.Role, &member.JoinedAt)
	if err != nil {
		return nil, fmt.Errorf("update workspace member role: %w", err)
	}
	user, err := r.GetUserByID(ctx, userID)
	if err != nil || user == nil {
		return nil, fmt.Errorf("load workspace member user: %w", err)
	}
	member.Name = user.Name
	member.Email = user.Email
	return member, nil
}

func (r *Repo) RemoveWorkspaceMember(ctx context.Context, workspaceID, userID string) ([]string, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin remove workspace member: %w", err)
	}
	defer tx.Rollback(ctx)

	var email string
	if err := tx.QueryRow(ctx, `SELECT email FROM users WHERE id = $1`, userID).Scan(&email); err != nil {
		return nil, fmt.Errorf("load workspace member email: %w", err)
	}

	var ownedProjectCount int
	if err := tx.QueryRow(ctx,
		`SELECT COUNT(*) FROM project_members pm JOIN projects p ON p.id = pm.project_id
		 WHERE p.workspace_id = $1 AND pm.user_id = $2 AND pm.role = 'owner'`, workspaceID, userID).Scan(&ownedProjectCount); err != nil {
		return nil, fmt.Errorf("count owned workspace projects: %w", err)
	}
	if ownedProjectCount > 0 {
		return nil, fmt.Errorf("transfer ownership of the member's projects before removing them from the workspace")
	}

	rows, err := tx.Query(ctx,
		`SELECT pm.project_id::text FROM project_members pm JOIN projects p ON p.id = pm.project_id
		 WHERE p.workspace_id = $1 AND pm.user_id = $2`, workspaceID, userID)
	if err != nil {
		return nil, fmt.Errorf("list project memberships for workspace removal: %w", err)
	}
	projectIDs := make([]string, 0)
	for rows.Next() {
		var projectID string
		if err := rows.Scan(&projectID); err != nil {
			rows.Close()
			return nil, fmt.Errorf("scan project membership for workspace removal: %w", err)
		}
		projectIDs = append(projectIDs, projectID)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return nil, fmt.Errorf("read project memberships for workspace removal: %w", err)
	}
	rows.Close()

	if _, err := tx.Exec(ctx,
		`DELETE FROM project_members pm USING projects p
		 WHERE pm.project_id = p.id AND p.workspace_id = $1 AND pm.user_id = $2`, workspaceID, userID); err != nil {
		return nil, fmt.Errorf("remove project memberships with workspace member: %w", err)
	}
	if _, err := tx.Exec(ctx,
		`DELETE FROM access_control ac USING projects p
		 WHERE ac.resource_id = p.id AND ac.resource_type = 'Project' AND p.workspace_id = $1 AND ac.user_id = $2`, workspaceID, userID); err != nil {
		return nil, fmt.Errorf("remove project access with workspace member: %w", err)
	}
	if _, err := tx.Exec(ctx,
		`UPDATE team_invitations invitation SET status = 'cancelled'
		 FROM projects p
		 WHERE invitation.project_id = p.id AND p.workspace_id = $1
		 AND LOWER(invitation.email) = LOWER($2) AND invitation.status = 'pending'`, workspaceID, email); err != nil {
		return nil, fmt.Errorf("cancel project invitations with workspace member: %w", err)
	}
	result, err := tx.Exec(ctx,
		`DELETE FROM workspace_members WHERE workspace_id = $1 AND user_id = $2 AND role <> 'owner'`, workspaceID, userID)
	if err != nil {
		return nil, fmt.Errorf("remove workspace member: %w", err)
	}
	if result.RowsAffected() != 1 {
		return nil, fmt.Errorf("workspace member not found or is the workspace owner")
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit remove workspace member: %w", err)
	}
	return projectIDs, nil
}

func (r *Repo) CreateWorkspaceInvitation(ctx context.Context, invitedByID string, req models.CreateWorkspaceInvitationRequest, workspaceID, tokenHash string, invitedUserID *string, expiresAt time.Time) (*models.WorkspaceInvitation, error) {
	invite := &models.WorkspaceInvitation{}
	err := r.pool.QueryRow(ctx,
		`INSERT INTO workspace_invitations (workspace_id, invited_by_id, invited_user_id, email, role, token_hash, expires_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)
		 RETURNING id, workspace_id, email, role, status, invited_user_id, invited_by_id, expires_at, accepted_at, created_at`,
		workspaceID, invitedByID, invitedUserID, req.Email, req.Role, tokenHash, expiresAt).
		Scan(&invite.ID, &invite.WorkspaceID, &invite.Email, &invite.Role, &invite.Status, &invite.InvitedUserID, &invite.InvitedByID, &invite.ExpiresAt, &invite.AcceptedAt, &invite.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("create workspace invitation: %w", err)
	}
	return invite, nil
}

func (r *Repo) ListWorkspaceInvitations(ctx context.Context, workspaceID string) ([]models.WorkspaceInvitation, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, workspace_id, email, role, status, invited_user_id, invited_by_id, expires_at, accepted_at, created_at
		 FROM workspace_invitations WHERE workspace_id = $1 ORDER BY created_at DESC`, workspaceID)
	if err != nil {
		return nil, fmt.Errorf("list workspace invitations: %w", err)
	}
	defer rows.Close()
	invitations := make([]models.WorkspaceInvitation, 0)
	for rows.Next() {
		var invite models.WorkspaceInvitation
		if err := rows.Scan(&invite.ID, &invite.WorkspaceID, &invite.Email, &invite.Role, &invite.Status, &invite.InvitedUserID, &invite.InvitedByID, &invite.ExpiresAt, &invite.AcceptedAt, &invite.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan workspace invitation: %w", err)
		}
		invitations = append(invitations, invite)
	}
	return invitations, rows.Err()
}

func (r *Repo) GetWorkspaceInvitationByTokenHash(ctx context.Context, tokenHash string) (*models.WorkspaceInvitation, error) {
	invite := &models.WorkspaceInvitation{}
	err := r.pool.QueryRow(ctx,
		`SELECT id, workspace_id, email, role, status, invited_user_id, invited_by_id, expires_at, accepted_at, created_at
		 FROM workspace_invitations WHERE token_hash = $1`, tokenHash).
		Scan(&invite.ID, &invite.WorkspaceID, &invite.Email, &invite.Role, &invite.Status, &invite.InvitedUserID, &invite.InvitedByID, &invite.ExpiresAt, &invite.AcceptedAt, &invite.CreatedAt)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("get workspace invitation by token hash: %w", err)
	}
	return invite, nil
}

func (r *Repo) AcceptWorkspaceInvitation(ctx context.Context, invitationID, userID string) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE workspace_invitations SET status = 'accepted', invited_user_id = $2, accepted_at = NOW()
		 WHERE id = $1`, invitationID, userID)
	if err != nil {
		return fmt.Errorf("accept workspace invitation: %w", err)
	}
	return nil
}

func (r *Repo) CancelWorkspaceInvitation(ctx context.Context, workspaceID, invitationID string) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE workspace_invitations SET status = 'cancelled' WHERE id = $1 AND workspace_id = $2`, invitationID, workspaceID)
	if err != nil {
		return fmt.Errorf("cancel workspace invitation: %w", err)
	}
	return nil
}

// ---- Projects ----

func (r *Repo) ListProjects(ctx context.Context, userID string, workspaceIDs ...string) ([]models.Project, error) {
	query := projectSelect
	args := []any{userID}
	if len(workspaceIDs) > 0 && workspaceIDs[0] != "" {
		query += ` AND p.workspace_id = $2`
		args = append(args, workspaceIDs[0])
	}
	query += ` ORDER BY p.created_at DESC`
	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("list projects: %w", err)
	}
	defer rows.Close()
	var out []models.Project
	for rows.Next() {
		var p models.Project
		if err := rows.Scan(&p.ID, &p.UserID, &p.Name, &p.Description, &p.Status, &p.DaysPerWeek, &p.AllocatedDays, &p.IsEncrypted, &p.TaskKeyPrefix, &p.TaskKeyPrefixLocked, &p.Role, &p.CreatedAt, &p.UpdatedAt, &p.WorkspaceID); err != nil {
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
	workspaceID := req.WorkspaceID
	if workspaceID == "" {
		workspaceID, err = r.GetDefaultWorkspaceID(ctx, userID)
		if err != nil {
			return nil, err
		}
	}
	workspaceRole, err := r.GetWorkspaceRole(ctx, workspaceID, userID)
	if err != nil {
		return nil, err
	}
	if workspaceRole != "owner" && workspaceRole != "admin" && workspaceRole != "member" {
		return nil, fmt.Errorf("workspace role cannot create projects")
	}
	if err := tx.QueryRow(ctx,
		`INSERT INTO projects (workspace_id, user_id, name, description, status, task_key_prefix, days_per_week, allocated_days, is_encrypted)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		 RETURNING id, user_id, name, description, status, task_key_prefix, (next_task_number > 1) AS task_key_prefix_locked, days_per_week, allocated_days, is_encrypted, created_at, updated_at, workspace_id`,
		workspaceID, userID, req.Name, req.Description, req.Status, taskKeyPrefix, req.DaysPerWeek, req.AllocatedDays, req.IsEncrypted,
	).Scan(&p.ID, &p.UserID, &p.Name, &p.Description, &p.Status, &p.TaskKeyPrefix, &p.TaskKeyPrefixLocked, &p.DaysPerWeek, &p.AllocatedDays, &p.IsEncrypted, &p.CreatedAt, &p.UpdatedAt, &p.WorkspaceID); err != nil {
		return nil, fmt.Errorf("create project: %w", err)
	}

	if _, err := tx.Exec(ctx,
		`INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'owner')
		 ON CONFLICT (project_id, user_id) DO NOTHING`,
		p.ID, userID,
	); err != nil {
		return nil, fmt.Errorf("create project owner membership: %w", err)
	}

	var autoAddMembers bool
	if err := tx.QueryRow(ctx, `SELECT auto_add_members_to_projects FROM workspaces WHERE id = $1`, workspaceID).Scan(&autoAddMembers); err != nil {
		return nil, fmt.Errorf("load workspace project membership default: %w", err)
	}
	if autoAddMembers && !req.IsEncrypted {
		if _, err := tx.Exec(ctx,
			`INSERT INTO project_members (project_id, user_id, role)
			 SELECT $1, wm.user_id,
				CASE WHEN wm.role = 'guest' THEN 'viewer' ELSE 'editor' END
			 FROM workspace_members wm
			 WHERE wm.workspace_id = $2 AND wm.user_id <> $3
			 ON CONFLICT (project_id, user_id) DO NOTHING`,
			p.ID, workspaceID, userID,
		); err != nil {
			return nil, fmt.Errorf("add workspace members to project: %w", err)
		}
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
		 RETURNING id, user_id, name, description, status, task_key_prefix, (next_task_number > 1) AS task_key_prefix_locked, days_per_week, allocated_days, is_encrypted, created_at, updated_at, workspace_id`,
		id, userID, req.Name, req.Description, req.Status, normalizedPrefix, req.DaysPerWeek, req.AllocatedDays, req.IsEncrypted,
	).Scan(&p.ID, &p.UserID, &p.Name, &p.Description, &p.Status, &p.TaskKeyPrefix, &p.TaskKeyPrefixLocked, &p.DaysPerWeek, &p.AllocatedDays, &p.IsEncrypted, &p.CreatedAt, &p.UpdatedAt, &p.WorkspaceID)
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

	var statusCount int
	if err := tx.QueryRow(ctx,
		`SELECT COUNT(*) FROM project_task_statuses WHERE project_id = $1`,
		projectID,
	).Scan(&statusCount); err != nil {
		return fmt.Errorf("count project task statuses: %w", err)
	}
	if len(statusIDs) != statusCount {
		return fmt.Errorf("reorder must include every project task status")
	}

	seenIDs := make(map[string]struct{}, len(statusIDs))
	for _, statusID := range statusIDs {
		if _, exists := seenIDs[statusID]; exists {
			return fmt.Errorf("reorder contains duplicate task status")
		}
		seenIDs[statusID] = struct{}{}
	}

	// Positions are unique per project. Move every row out of the target range
	// before assigning its final position so swapping two neighbours never
	// violates the unique constraint midway through the transaction.
	result, err := tx.Exec(ctx,
		`UPDATE project_task_statuses
		 SET position = position + $2,
		     updated_at = NOW()
		 WHERE project_id = $1`,
		projectID, statusCount,
	)
	if err != nil {
		return fmt.Errorf("stage project task status reorder: %w", err)
	}
	if result.RowsAffected() != int64(statusCount) {
		return fmt.Errorf("project task statuses changed while reordering")
	}

	for idx, statusID := range statusIDs {
		result, err := tx.Exec(ctx,
			`UPDATE project_task_statuses
			 SET position = $3,
			     updated_at = NOW()
			 WHERE project_id = $1 AND id = $2`,
			projectID, statusID, idx,
		)
		if err != nil {
			return fmt.Errorf("reorder project task statuses: %w", err)
		}
		if result.RowsAffected() != 1 {
			return fmt.Errorf("task status not found in project")
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit reorder project task statuses: %w", err)
	}
	return nil
}

// ---- Project milestones ----

func scanMilestoneRows(rows pgx.Rows) ([]models.ProjectMilestone, error) {
	milestones := make([]models.ProjectMilestone, 0)
	for rows.Next() {
		var milestone models.ProjectMilestone
		if err := rows.Scan(&milestone.ID, &milestone.ProjectID, &milestone.CreatedBy, &milestone.Title, &milestone.Description, &milestone.Status, &milestone.DueDate, &milestone.Position, &milestone.CreatedAt, &milestone.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan milestone: %w", err)
		}
		milestones = append(milestones, milestone)
	}
	return milestones, rows.Err()
}

const milestoneSelect = `SELECT id, project_id, created_by, title, description, status, due_date, position, created_at, updated_at FROM project_milestones`

func (r *Repo) ListProjectMilestones(ctx context.Context, projectID, userID string) ([]models.ProjectMilestone, error) {
	rows, err := r.pool.Query(ctx, milestoneSelect+` WHERE project_id = $1 AND EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = $1 AND pm.user_id = $2) ORDER BY position ASC, due_date ASC NULLS LAST, created_at ASC`, projectID, userID)
	if err != nil {
		return nil, fmt.Errorf("list project milestones: %w", err)
	}
	defer rows.Close()
	return scanMilestoneRows(rows)
}

func (r *Repo) CreateProjectMilestone(ctx context.Context, projectID, userID string, req models.CreateProjectMilestoneRequest) (*models.ProjectMilestone, error) {
	milestone := &models.ProjectMilestone{}
	// Position is calculated inside the insert so concurrent project members do not
	// need to coordinate client-side ordering.
	err := r.pool.QueryRow(ctx, `
		INSERT INTO project_milestones (project_id, created_by, title, description, due_date, position)
		SELECT $1, $2, $3, $4, $5::date, COALESCE(MAX(position), -1) + 1
		FROM project_milestones WHERE project_id = $1
		AND EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = $1 AND pm.user_id = $2 AND pm.role IN ('owner', 'admin', 'editor'))
		RETURNING id, project_id, created_by, title, description, status, due_date, position, created_at, updated_at`, projectID, userID, req.Title, req.Description, req.DueDate).Scan(&milestone.ID, &milestone.ProjectID, &milestone.CreatedBy, &milestone.Title, &milestone.Description, &milestone.Status, &milestone.DueDate, &milestone.Position, &milestone.CreatedAt, &milestone.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("create project milestone: %w", err)
	}
	return milestone, nil
}

func (r *Repo) UpdateProjectMilestone(ctx context.Context, milestoneID, userID string, req models.UpdateProjectMilestoneRequest) (*models.ProjectMilestone, error) {
	milestone := &models.ProjectMilestone{}
	err := r.pool.QueryRow(ctx, `
		UPDATE project_milestones m SET title = COALESCE($3, m.title), description = COALESCE($4, m.description), status = COALESCE($5, m.status), due_date = COALESCE($6::date, m.due_date)
		WHERE m.id = $1 AND EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = m.project_id AND pm.user_id = $2 AND pm.role IN ('owner', 'admin', 'editor'))
		RETURNING m.id, m.project_id, m.created_by, m.title, m.description, m.status, m.due_date, m.position, m.created_at, m.updated_at`, milestoneID, userID, req.Title, req.Description, req.Status, req.DueDate).Scan(&milestone.ID, &milestone.ProjectID, &milestone.CreatedBy, &milestone.Title, &milestone.Description, &milestone.Status, &milestone.DueDate, &milestone.Position, &milestone.CreatedAt, &milestone.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("update project milestone: %w", err)
	}
	return milestone, nil
}

func (r *Repo) DeleteProjectMilestone(ctx context.Context, milestoneID, userID string) error {
	_, err := r.pool.Exec(ctx, `DELETE FROM project_milestones m WHERE m.id = $1 AND EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = m.project_id AND pm.user_id = $2 AND pm.role IN ('owner', 'admin', 'editor'))`, milestoneID, userID)
	return err
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
	var workspaceID string
	if err := r.pool.QueryRow(ctx, `SELECT workspace_id FROM projects WHERE id = $1`, projectID).Scan(&workspaceID); err != nil {
		return nil, fmt.Errorf("load project workspace for member: %w", err)
	}
	allowed, err := r.CanAccessWorkspace(ctx, workspaceID, userID)
	if err != nil {
		return nil, fmt.Errorf("validate workspace member for project: %w", err)
	}
	if !allowed {
		return nil, fmt.Errorf("project members must belong to the workspace")
	}
	member := &models.ProjectMember{}
	err = r.pool.QueryRow(ctx,
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
		 WHERE pm.project_id = $1 AND pm.user_id = $2 AND pm.role <> 'owner' AND u.id = pm.user_id
		 RETURNING pm.id, pm.project_id, pm.user_id, u.email, u.name, pm.role, pm.joined_at`,
		projectID, userID, role,
	).Scan(&member.ID, &member.ProjectID, &member.UserID, &member.Email, &member.Name, &member.Role, &member.JoinedAt)
	if err != nil {
		return nil, fmt.Errorf("update project member role: %w", err)
	}
	return member, nil
}

func (r *Repo) RemoveProjectMember(ctx context.Context, projectID, userID string) error {
	result, err := r.pool.Exec(ctx, `DELETE FROM project_members WHERE project_id = $1 AND user_id = $2 AND role <> 'owner'`, projectID, userID)
	if err != nil {
		return fmt.Errorf("remove project member: %w", err)
	}
	if result.RowsAffected() != 1 {
		return fmt.Errorf("project member not found or is the project owner")
	}
	return nil
}

func (r *Repo) CreateInvitation(ctx context.Context, invitedByID string, req models.CreateInvitationRequest, tokenHash string, invitedUserID *string, expiresAt time.Time) (*models.TeamInvitation, error) {
	invite := &models.TeamInvitation{}
	err := r.pool.QueryRow(ctx,
		`INSERT INTO team_invitations (project_id, invited_by_id, invited_user_id, email, role, workspace_role, token_hash, expires_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		 RETURNING id, project_id, email, role, workspace_role, status, invited_user_id, invited_by_id, expires_at, accepted_at, created_at`,
		req.ProjectID, invitedByID, invitedUserID, req.Email, req.Role, req.WorkspaceRole, tokenHash, expiresAt,
	).Scan(&invite.ID, &invite.ProjectID, &invite.Email, &invite.Role, &invite.WorkspaceRole, &invite.Status, &invite.InvitedUserID, &invite.InvitedByID, &invite.ExpiresAt, &invite.AcceptedAt, &invite.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("create invitation: %w", err)
	}
	return invite, nil
}

func (r *Repo) ListInvitations(ctx context.Context, projectID string) ([]models.TeamInvitation, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, project_id, email, role, workspace_role, status, invited_user_id, invited_by_id, expires_at, accepted_at, created_at
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
		if err := rows.Scan(&invite.ID, &invite.ProjectID, &invite.Email, &invite.Role, &invite.WorkspaceRole, &invite.Status, &invite.InvitedUserID, &invite.InvitedByID, &invite.ExpiresAt, &invite.AcceptedAt, &invite.CreatedAt); err != nil {
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
		`SELECT id, project_id, email, role, workspace_role, status, invited_user_id, invited_by_id, expires_at, accepted_at, created_at
		 FROM team_invitations
		 WHERE token_hash = $1`,
		tokenHash,
	).Scan(&invite.ID, &invite.ProjectID, &invite.Email, &invite.Role, &invite.WorkspaceRole, &invite.Status, &invite.InvitedUserID, &invite.InvitedByID, &invite.ExpiresAt, &invite.AcceptedAt, &invite.CreatedAt)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("get invitation by token hash: %w", err)
	}
	return invite, nil
}

func (r *Repo) AcceptInvitation(ctx context.Context, invitationID, userID string) (string, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return "", fmt.Errorf("begin accept project invitation: %w", err)
	}
	defer tx.Rollback(ctx)

	var projectID, workspaceID, projectRole, workspaceRole string
	if err := tx.QueryRow(ctx,
		`SELECT invitation.project_id, project.workspace_id, invitation.role, invitation.workspace_role
		 FROM team_invitations invitation
		 JOIN projects project ON project.id = invitation.project_id
		 WHERE invitation.id = $1 AND invitation.status = 'pending'
		 FOR UPDATE`, invitationID).
		Scan(&projectID, &workspaceID, &projectRole, &workspaceRole); err != nil {
		return "", fmt.Errorf("load project invitation for acceptance: %w", err)
	}

	if _, err := tx.Exec(ctx,
		`INSERT INTO workspace_members (workspace_id, user_id, role)
		 VALUES ($1, $2, $3)
		 ON CONFLICT (workspace_id, user_id) DO NOTHING`, workspaceID, userID, workspaceRole); err != nil {
		return "", fmt.Errorf("add invited user to workspace: %w", err)
	}
	if _, err := tx.Exec(ctx,
		`INSERT INTO project_members (project_id, user_id, role)
		 VALUES ($1, $2, $3)
		 ON CONFLICT (project_id, user_id) DO UPDATE SET role = EXCLUDED.role`, projectID, userID, projectRole); err != nil {
		return "", fmt.Errorf("add invited user to project: %w", err)
	}
	if _, err := tx.Exec(ctx,
		`UPDATE team_invitations SET status = 'accepted', invited_user_id = $2, accepted_at = NOW()
		 WHERE id = $1`, invitationID, userID); err != nil {
		return "", fmt.Errorf("accept invitation: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return "", fmt.Errorf("commit accept project invitation: %w", err)
	}
	return workspaceID, nil
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

func (r *Repo) HasTaskAssignee(ctx context.Context, taskID, userID string) (bool, error) {
	var exists bool
	if err := r.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM task_assignees WHERE task_id = $1 AND user_id = $2)`, taskID, userID).Scan(&exists); err != nil {
		return false, fmt.Errorf("check task assignee: %w", err)
	}
	return exists, nil
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
				tags = COALESCE($15, tags), dependencies = COALESCE($16, dependencies),
				recurrence = CASE WHEN $17::text IS NOT NULL THEN NULLIF($17::text, '') ELSE recurrence END,
				is_encrypted = COALESCE($18, is_encrypted)
		 WHERE id = $1 AND EXISTS (
		 	SELECT 1 FROM project_members pm
		 	WHERE pm.project_id = tasks.project_id AND pm.user_id = $2 AND pm.role IN ('owner', 'admin', 'editor')
		 )
		 RETURNING `+taskSelectColumns,
		id, userID, req.Title, req.Description, req.Completed, req.ParentID, req.TimeSpent, req.IsTimerRunning, req.TimerStartedAt, req.TimeEntries, req.Order, req.Priority, req.KanbanStatus, req.Deadline, req.Tags, req.Dependencies, req.Recurrence, req.IsEncrypted,
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

func (r *Repo) ListGuides(ctx context.Context, userID string, workspaceIDs ...string) ([]models.WikiGuide, error) {
	query := `SELECT id, user_id, title, description, is_encrypted, created_at, updated_at, workspace_id, project_id, parent_id FROM wiki_guides WHERE user_id = $1`
	args := []any{userID}
	if len(workspaceIDs) > 0 && workspaceIDs[0] != "" {
		query += ` AND workspace_id = $2`
		args = append(args, workspaceIDs[0])
	}
	query += ` ORDER BY created_at DESC`
	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("list guides: %w", err)
	}
	defer rows.Close()
	var out []models.WikiGuide
	for rows.Next() {
		var g models.WikiGuide
		if err := rows.Scan(&g.ID, &g.UserID, &g.Title, &g.Description, &g.IsEncrypted, &g.CreatedAt, &g.UpdatedAt, &g.WorkspaceID, &g.ProjectID, &g.ParentID); err != nil {
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
		`SELECT id, user_id, title, description, is_encrypted, created_at, updated_at, workspace_id, project_id, parent_id FROM wiki_guides WHERE id = $1 AND user_id = $2`, id, userID,
	).Scan(&g.ID, &g.UserID, &g.Title, &g.Description, &g.IsEncrypted, &g.CreatedAt, &g.UpdatedAt, &g.WorkspaceID, &g.ProjectID, &g.ParentID)
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
	workspaceID := req.WorkspaceID
	if workspaceID == "" {
		var err error
		workspaceID, err = r.GetDefaultWorkspaceID(ctx, userID)
		if err != nil {
			return nil, err
		}
	}
	if allowed, err := r.CanAccessWorkspace(ctx, workspaceID, userID); err != nil || !allowed {
		if err != nil {
			return nil, err
		}
		return nil, fmt.Errorf("workspace access denied")
	}
	if err := r.validateKnowledgeLinks(ctx, workspaceID, req.ProjectID, req.ParentID); err != nil {
		return nil, err
	}
	err := r.pool.QueryRow(ctx,
		`INSERT INTO wiki_guides (workspace_id, user_id, project_id, parent_id, title, description, is_encrypted) VALUES ($1, $2, NULLIF($3::text, '')::uuid, NULLIF($4::text, '')::uuid, $5, $6, $7)
		 RETURNING id, user_id, title, description, is_encrypted, created_at, updated_at, workspace_id, project_id, parent_id`,
		workspaceID, userID, req.ProjectID, req.ParentID, req.Title, req.Description, req.IsEncrypted,
	).Scan(&g.ID, &g.UserID, &g.Title, &g.Description, &g.IsEncrypted, &g.CreatedAt, &g.UpdatedAt, &g.WorkspaceID, &g.ProjectID, &g.ParentID)
	if err != nil {
		return nil, fmt.Errorf("create guide: %w", err)
	}
	return g, nil
}

func (r *Repo) UpdateGuide(ctx context.Context, id, userID string, req models.UpdateGuideRequest) (*models.WikiGuide, error) {
	g := &models.WikiGuide{}
	var currentWorkspaceID string
	if err := r.pool.QueryRow(ctx, `SELECT workspace_id FROM wiki_guides WHERE id = $1 AND user_id = $2`, id, userID).Scan(&currentWorkspaceID); err != nil {
		return nil, fmt.Errorf("load guide workspace: %w", err)
	}
	workspaceID := currentWorkspaceID
	if req.WorkspaceID != nil && *req.WorkspaceID != "" {
		workspaceID = *req.WorkspaceID
	}
	if allowed, err := r.CanAccessWorkspace(ctx, workspaceID, userID); err != nil || !allowed {
		if err != nil {
			return nil, err
		}
		return nil, fmt.Errorf("workspace access denied")
	}
	if err := r.validateKnowledgeLinks(ctx, workspaceID, req.ProjectID, req.ParentID); err != nil {
		return nil, err
	}
	err := r.pool.QueryRow(ctx,
		`UPDATE wiki_guides SET title = COALESCE($3, title), description = COALESCE($4, description), is_encrypted = COALESCE($5, is_encrypted), workspace_id = COALESCE($6, workspace_id), project_id = CASE WHEN $7::text IS NOT NULL THEN NULLIF($7::text, '')::uuid ELSE project_id END, parent_id = CASE WHEN $8::text IS NOT NULL THEN NULLIF($8::text, '')::uuid ELSE parent_id END
		 WHERE id = $1 AND user_id = $2
		 RETURNING id, user_id, title, description, is_encrypted, created_at, updated_at, workspace_id, project_id, parent_id`,
		id, userID, req.Title, req.Description, req.IsEncrypted, req.WorkspaceID, req.ProjectID, req.ParentID,
	).Scan(&g.ID, &g.UserID, &g.Title, &g.Description, &g.IsEncrypted, &g.CreatedAt, &g.UpdatedAt, &g.WorkspaceID, &g.ProjectID, &g.ParentID)
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
		 WHERE a.project_id IS NOT NULL
		   AND EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = a.project_id AND pm.user_id = $1)
		 ORDER BY a.created_at DESC LIMIT 50`, userID)
	if err != nil {
		return nil, fmt.Errorf("list activity: %w", err)
	}
	defer rows.Close()
	return scanActivityRows(rows)
}

func (r *Repo) IsProjectMember(ctx context.Context, projectID, userID string) (bool, error) {
	var exists bool
	if err := r.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2)`, projectID, userID).Scan(&exists); err != nil {
		return false, fmt.Errorf("check project member: %w", err)
	}
	return exists, nil
}

func scanNotifications(rows pgx.Rows) ([]models.Notification, error) {
	out := []models.Notification{}
	for rows.Next() {
		var n models.Notification
		if err := rows.Scan(&n.ID, &n.RecipientUserID, &n.ActorUserID, &n.ActorName, &n.Type, &n.ProjectID, &n.ProjectName, &n.TaskID, &n.TaskKey, &n.TaskTitle, &n.CommentID, &n.DeadlineAt, &n.ReadAt, &n.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, n)
	}
	return out, rows.Err()
}

const notificationSelect = `SELECT n.id, n.recipient_user_id, n.actor_user_id, actor.name, n.type,
 n.project_id, p.name, n.task_id, t.task_key, t.title, n.comment_id, n.deadline_at, n.read_at, n.created_at
 FROM notifications n
 JOIN users actor ON actor.id = n.actor_user_id
 JOIN projects p ON p.id = n.project_id
 JOIN tasks t ON t.id = n.task_id`

func (r *Repo) CreateNotification(ctx context.Context, recipientUserID, actorUserID, notificationType, projectID, taskID string, commentID *string) (*models.Notification, error) {
	if recipientUserID == actorUserID {
		return nil, nil
	}
	var id string
	err := r.pool.QueryRow(ctx, `INSERT INTO notifications (recipient_user_id, actor_user_id, type, project_id, task_id, comment_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`, recipientUserID, actorUserID, notificationType, projectID, taskID, commentID).Scan(&id)
	if err != nil {
		return nil, fmt.Errorf("create notification: %w", err)
	}
	rows, err := r.pool.Query(ctx, notificationSelect+` WHERE n.id = $1`, id)
	if err != nil {
		return nil, fmt.Errorf("load notification: %w", err)
	}
	defer rows.Close()
	notifications, err := scanNotifications(rows)
	if err != nil || len(notifications) != 1 {
		return nil, err
	}
	return &notifications[0], nil
}

func (r *Repo) ListNotifications(ctx context.Context, userID string) ([]models.Notification, error) {
	rows, err := r.pool.Query(ctx, notificationSelect+` WHERE n.recipient_user_id = $1
		AND EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = n.project_id AND pm.user_id = $1)
		ORDER BY n.created_at DESC LIMIT 50`, userID)
	if err != nil {
		return nil, fmt.Errorf("list notifications: %w", err)
	}
	defer rows.Close()
	return scanNotifications(rows)
}

func (r *Repo) UnreadNotificationCount(ctx context.Context, userID string) (int, error) {
	var count int
	if err := r.pool.QueryRow(ctx, `SELECT COUNT(*) FROM notifications n WHERE n.recipient_user_id = $1 AND n.read_at IS NULL
		AND EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = n.project_id AND pm.user_id = $1)`, userID).Scan(&count); err != nil {
		return 0, fmt.Errorf("count notifications: %w", err)
	}
	return count, nil
}

func (r *Repo) MarkNotificationRead(ctx context.Context, notificationID, userID string) (*models.Notification, error) {
	var id string
	err := r.pool.QueryRow(ctx, `UPDATE notifications SET read_at = COALESCE(read_at, NOW()) WHERE id = $1 AND recipient_user_id = $2
		AND EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = notifications.project_id AND pm.user_id = $2)
		RETURNING id`, notificationID, userID).Scan(&id)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("mark notification read: %w", err)
	}
	rows, err := r.pool.Query(ctx, notificationSelect+` WHERE n.id = $1`, id)
	if err != nil {
		return nil, fmt.Errorf("load notification: %w", err)
	}
	defer rows.Close()
	notifications, err := scanNotifications(rows)
	if err != nil || len(notifications) != 1 {
		return nil, err
	}
	return &notifications[0], nil
}

func (r *Repo) DeleteNotification(ctx context.Context, notificationID, userID string) (bool, error) {
	result, err := r.pool.Exec(ctx, `DELETE FROM notifications n
		WHERE n.id = $1 AND n.recipient_user_id = $2
		AND EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = n.project_id AND pm.user_id = $2)`, notificationID, userID)
	if err != nil {
		return false, fmt.Errorf("delete notification: %w", err)
	}
	return result.RowsAffected() == 1, nil
}

func (r *Repo) ListDeadlineReminderTasks(ctx context.Context, until time.Time) ([]models.Task, error) {
	rows, err := r.pool.Query(ctx, `SELECT `+taskSelectColumns+`
		FROM tasks
		WHERE deadline IS NOT NULL AND deadline <= $1 AND completed = FALSE`, until)
	if err != nil {
		return nil, fmt.Errorf("list deadline reminder tasks: %w", err)
	}
	defer rows.Close()
	return scanTasks(rows)
}

func (r *Repo) ListDeadlineRecipients(ctx context.Context, taskID string) ([]string, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT user_id FROM task_assignees WHERE task_id = $1
		UNION
		SELECT user_id FROM tasks WHERE id = $1 AND NOT EXISTS (SELECT 1 FROM task_assignees WHERE task_id = $1)`, taskID)
	if err != nil {
		return nil, fmt.Errorf("list deadline recipients: %w", err)
	}
	defer rows.Close()
	recipients := []string{}
	for rows.Next() {
		var userID string
		if err := rows.Scan(&userID); err != nil {
			return nil, fmt.Errorf("scan deadline recipient: %w", err)
		}
		recipients = append(recipients, userID)
	}
	return recipients, rows.Err()
}

func (r *Repo) CreateDeadlineNotification(ctx context.Context, recipientUserID, actorUserID, notificationType, projectID, taskID string, deadline time.Time) (*models.Notification, error) {
	var id string
	err := r.pool.QueryRow(ctx, `INSERT INTO notifications (recipient_user_id, actor_user_id, type, project_id, task_id, deadline_at)
		VALUES ($1, $2, $3, $4, $5, $6)
		ON CONFLICT (recipient_user_id, task_id, type, deadline_at) WHERE deadline_at IS NOT NULL DO NOTHING
		RETURNING id`, recipientUserID, actorUserID, notificationType, projectID, taskID, deadline).Scan(&id)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("create deadline notification: %w", err)
	}
	rows, err := r.pool.Query(ctx, notificationSelect+` WHERE n.id = $1`, id)
	if err != nil {
		return nil, fmt.Errorf("load deadline notification: %w", err)
	}
	defer rows.Close()
	notifications, err := scanNotifications(rows)
	if err != nil || len(notifications) != 1 {
		return nil, err
	}
	return &notifications[0], nil
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

func (r *Repo) ListSnippets(ctx context.Context, userID string, workspaceIDs ...string) ([]models.Snippet, error) {
	query := `SELECT id, user_id, title, content, blocks, language, tags, description, is_encrypted, created_at, updated_at, workspace_id, project_id, collection FROM snippets WHERE user_id = $1`
	args := []any{userID}
	if len(workspaceIDs) > 0 && workspaceIDs[0] != "" {
		query += ` AND workspace_id = $2`
		args = append(args, workspaceIDs[0])
	}
	query += ` ORDER BY created_at DESC`
	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("list snippets: %w", err)
	}
	defer rows.Close()
	var out []models.Snippet
	for rows.Next() {
		var s models.Snippet
		if err := rows.Scan(&s.ID, &s.UserID, &s.Title, &s.Content, &s.Blocks, &s.Language, &s.Tags, &s.Description, &s.IsEncrypted, &s.CreatedAt, &s.UpdatedAt, &s.WorkspaceID, &s.ProjectID, &s.Collection); err != nil {
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
	workspaceID := req.WorkspaceID
	if workspaceID == "" {
		var err error
		workspaceID, err = r.GetDefaultWorkspaceID(ctx, userID)
		if err != nil {
			return nil, err
		}
	}
	if allowed, err := r.CanAccessWorkspace(ctx, workspaceID, userID); err != nil || !allowed {
		if err != nil {
			return nil, err
		}
		return nil, fmt.Errorf("workspace access denied")
	}
	if err := r.validateKnowledgeLinks(ctx, workspaceID, req.ProjectID, nil); err != nil {
		return nil, err
	}
	err := r.pool.QueryRow(ctx,
		`INSERT INTO snippets (workspace_id, user_id, project_id, collection, title, content, blocks, language, tags, description, is_encrypted) VALUES ($1, $2, NULLIF($3::text, '')::uuid, NULLIF($4::text, ''), $5, $6, $7, $8, $9, $10, $11)
		 RETURNING id, user_id, title, content, blocks, language, tags, description, is_encrypted, created_at, updated_at, workspace_id, project_id, collection`,
		workspaceID, userID, req.ProjectID, req.Collection, req.Title, req.Content, req.Blocks, req.Language, req.Tags, req.Description, req.IsEncrypted,
	).Scan(&s.ID, &s.UserID, &s.Title, &s.Content, &s.Blocks, &s.Language, &s.Tags, &s.Description, &s.IsEncrypted, &s.CreatedAt, &s.UpdatedAt, &s.WorkspaceID, &s.ProjectID, &s.Collection)
	if err != nil {
		return nil, fmt.Errorf("create snippet: %w", err)
	}
	return s, nil
}

func (r *Repo) validateKnowledgeLinks(ctx context.Context, workspaceID string, projectID, parentID *string) error {
	if projectID != nil && strings.TrimSpace(*projectID) != "" {
		var exists bool
		if err := r.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM projects WHERE id = $1 AND workspace_id = $2)`, *projectID, workspaceID).Scan(&exists); err != nil {
			return fmt.Errorf("validate knowledge project link: %w", err)
		}
		if !exists {
			return fmt.Errorf("project does not belong to workspace")
		}
	}
	if parentID != nil && strings.TrimSpace(*parentID) != "" {
		var exists bool
		if err := r.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM wiki_guides WHERE id = $1 AND workspace_id = $2)`, *parentID, workspaceID).Scan(&exists); err != nil {
			return fmt.Errorf("validate wiki parent link: %w", err)
		}
		if !exists {
			return fmt.Errorf("parent guide does not belong to workspace")
		}
	}
	return nil
}

func (r *Repo) UpdateSnippet(ctx context.Context, id, userID string, req models.UpdateSnippetRequest) (*models.Snippet, error) {
	s := &models.Snippet{}
	var currentWorkspaceID string
	if err := r.pool.QueryRow(ctx, `SELECT workspace_id FROM snippets WHERE id = $1 AND user_id = $2`, id, userID).Scan(&currentWorkspaceID); err != nil {
		return nil, fmt.Errorf("load snippet workspace: %w", err)
	}
	workspaceID := currentWorkspaceID
	if req.WorkspaceID != nil && *req.WorkspaceID != "" {
		workspaceID = *req.WorkspaceID
	}
	if allowed, err := r.CanAccessWorkspace(ctx, workspaceID, userID); err != nil || !allowed {
		if err != nil {
			return nil, err
		}
		return nil, fmt.Errorf("workspace access denied")
	}
	if err := r.validateKnowledgeLinks(ctx, workspaceID, req.ProjectID, nil); err != nil {
		return nil, err
	}
	err := r.pool.QueryRow(ctx,
		`UPDATE snippets SET title = COALESCE($3, title), content = COALESCE($4, content), blocks = COALESCE($5, blocks),
			 language = COALESCE($6, language), tags = COALESCE($7, tags), description = COALESCE($8, description), is_encrypted = COALESCE($9, is_encrypted), workspace_id = COALESCE($10, workspace_id), project_id = CASE WHEN $11::text IS NOT NULL THEN NULLIF($11::text, '')::uuid ELSE project_id END, collection = CASE WHEN $12::text IS NOT NULL THEN NULLIF($12::text, '') ELSE collection END
		 WHERE id = $1 AND user_id = $2
		 RETURNING id, user_id, title, content, blocks, language, tags, description, is_encrypted, created_at, updated_at, workspace_id, project_id, collection`,
		id, userID, req.Title, req.Content, req.Blocks, req.Language, req.Tags, req.Description, req.IsEncrypted, req.WorkspaceID, req.ProjectID, req.Collection,
	).Scan(&s.ID, &s.UserID, &s.Title, &s.Content, &s.Blocks, &s.Language, &s.Tags, &s.Description, &s.IsEncrypted, &s.CreatedAt, &s.UpdatedAt, &s.WorkspaceID, &s.ProjectID, &s.Collection)
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
