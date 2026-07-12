package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/justlabv1/justspace/backend/internal/config"
	"github.com/justlabv1/justspace/backend/internal/database"
	"github.com/justlabv1/justspace/backend/internal/handlers"
	"github.com/justlabv1/justspace/backend/internal/middleware"
	"github.com/justlabv1/justspace/backend/internal/reminders"
	"github.com/justlabv1/justspace/backend/internal/repository"
	"github.com/justlabv1/justspace/backend/internal/storage"
	"github.com/justlabv1/justspace/backend/internal/websocket"
)

func main() {
	cfg := config.Load()

	pool, err := database.Connect(cfg)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer pool.Close()
	log.Println("Connected to PostgreSQL")

	migrationsDir := os.Getenv("MIGRATIONS_DIR")
	if migrationsDir == "" {
		exe, _ := os.Executable()
		migrationsDir = filepath.Join(filepath.Dir(exe), "migrations")
		if _, err := os.Stat(migrationsDir); os.IsNotExist(err) {
			migrationsDir = "migrations"
		}
	}
	if err := database.RunMigrations(pool, migrationsDir); err != nil {
		log.Fatalf("Failed to run migrations: %v", err)
	}
	log.Println("Migrations complete")

	repo := repository.New(pool)
	fileStore, err := storage.NewFileStore(cfg.FileStorageRoot)
	if err != nil {
		log.Fatalf("Failed to initialize file storage: %v", err)
	}
	hub := websocket.NewHub(cfg.JWTSecret, cfg.CORSOrigin, repo)
	go hub.Run()
	go reminders.NewDeadlineService(repo, hub).Run()
	go reminders.RunAdminAuditRetention(repo)

	authH := handlers.NewAuthHandler(repo, cfg.JWTSecret, cfg.OIDCEncryptionKey, cfg.CORSOrigin, hub, fileStore)
	projectH := handlers.NewProjectHandler(repo, hub)
	taskH := handlers.NewTaskHandler(repo, hub)
	wikiH := handlers.NewWikiHandler(repo, hub)
	installH := handlers.NewInstallationHandler(repo, hub)
	snippetH := handlers.NewSnippetHandler(repo, hub)
	activityH := handlers.NewActivityHandler(repo)
	notificationH := handlers.NewNotificationHandler(repo, hub)
	vaultH := handlers.NewVaultHandler(repo)
	accessH := handlers.NewAccessHandler(repo, hub)
	versionH := handlers.NewVersionHandler(repo)
	collabH := handlers.NewCollaborationHandler(repo, hub, fileStore, cfg.MaxUploadBytes)
	workspaceH := handlers.NewWorkspaceHandler(repo, hub)
	customerH := handlers.NewCustomerHandler(repo)
	milestoneH := handlers.NewMilestoneHandler(repo, hub)

	r := chi.NewRouter()
	r.Use(chimw.Logger)
	r.Use(chimw.Recoverer)
	r.Use(chimw.RealIP)
	r.Use(securityHeaders)
	r.Use(corsMiddleware(cfg.CORSOrigin))

	r.Get("/api/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"ok"}`))
	})

	r.Post("/api/auth/signup", authH.Signup)
	r.Post("/api/auth/login", authH.Login)
	r.Post("/api/auth/logout", authH.Logout)
	r.Get("/api/auth/config", authH.AuthConfig)
	r.Get("/api/platform/branding", authH.PublicBranding)
	r.Get("/api/platform/branding/logo/{size}", authH.PublicBrandLogo)
	r.Get("/api/auth/oidc/{provider}/start", authH.OIDCStart)
	r.Get("/api/auth/oidc/{provider}/callback", authH.OIDCCallback)
	r.Get("/api/ws", hub.HandleWS)

	r.Group(func(r chi.Router) {
		r.Use(middleware.Auth(cfg.JWTSecret, repo))

		r.Get("/api/auth/me", authH.Me)
		r.Put("/api/auth/profile", authH.UpdateProfile)
		r.Get("/api/auth/oidc/identities", authH.ListOIDCIdentities)
		r.Delete("/api/auth/oidc/identities/{identityId}", authH.DeleteOIDCIdentity)
		r.Get("/api/auth/oidc/{provider}/link", authH.OIDCStartLink)

		r.Get("/api/workspaces", workspaceH.List)
		r.Post("/api/workspaces", workspaceH.Create)
		r.Put("/api/workspaces/{id}", workspaceH.Update)
		r.Get("/api/workspaces/{workspaceId}/members", workspaceH.ListMembers)
		r.Post("/api/workspaces/{workspaceId}/members", workspaceH.AddMember)
		r.Put("/api/workspaces/{workspaceId}/members/{userId}", workspaceH.UpdateMemberRole)
		r.Delete("/api/workspaces/{workspaceId}/members/{userId}", workspaceH.RemoveMember)
		r.Get("/api/workspaces/{workspaceId}/invitations", workspaceH.ListInvitations)
		r.Post("/api/workspaces/{workspaceId}/invitations", workspaceH.CreateInvitation)
		r.Delete("/api/workspaces/{workspaceId}/invitations/{invitationId}", workspaceH.CancelInvitation)
		r.Get("/api/workspaces/{workspaceId}/customers", customerH.List)
		r.Post("/api/workspaces/{workspaceId}/customers", customerH.Create)
		r.Put("/api/workspaces/{workspaceId}/customers/{customerId}", customerH.Update)

		r.Get("/api/admin/settings", authH.AdminSettings)
		r.Put("/api/admin/settings", authH.UpdateAdminSettings)
		r.Get("/api/admin/branding", authH.AdminBranding)
		r.Put("/api/admin/branding", authH.UpdateAdminBranding)
		r.Post("/api/admin/branding/logo", authH.UploadBrandLogo)
		r.Delete("/api/admin/branding/logo", authH.DeleteBrandLogo)
		r.Get("/api/admin/overview", authH.AdminOverview)
		r.Get("/api/admin/audit", authH.AdminAudit)
		r.Get("/api/admin/users", authH.AdminUsers)
		r.Patch("/api/admin/users/{userId}", authH.UpdateAdminUser)
		r.Post("/api/admin/oidc/providers", authH.AdminCreateOIDCProvider)
		r.Put("/api/admin/oidc/providers/{providerId}", authH.AdminUpdateOIDCProvider)
		r.Delete("/api/admin/oidc/providers/{providerId}", authH.AdminDeleteOIDCProvider)

		r.Get("/api/projects", projectH.List)
		r.Post("/api/projects", projectH.Create)
		r.Get("/api/projects/{id}", projectH.Get)
		r.Put("/api/projects/{id}", projectH.Update)
		r.Post("/api/projects/{id}/encryption/migrate", projectH.MigrateEncryption)
		r.Post("/api/projects/{id}/encryption/repair", projectH.RepairEncryption)
		r.Delete("/api/projects/{id}", projectH.Delete)
		r.Get("/api/projects/{projectId}/allocations", customerH.ListAllocations)
		r.Put("/api/projects/{projectId}/allocations/{userId}", customerH.UpsertAllocation)
		r.Get("/api/projects/{projectId}/task-statuses", projectH.ListTaskStatuses)
		r.Get("/api/projects/{projectId}/milestones", milestoneH.List)
		r.Post("/api/projects/{projectId}/milestones", milestoneH.Create)
		r.Put("/api/milestones/{id}", milestoneH.Update)
		r.Delete("/api/milestones/{id}", milestoneH.Delete)
		r.Post("/api/projects/{projectId}/task-statuses", projectH.CreateTaskStatus)
		r.Put("/api/projects/{projectId}/task-statuses/reorder", projectH.ReorderTaskStatuses)
		r.Put("/api/projects/{projectId}/task-statuses/{statusId}", projectH.UpdateTaskStatus)
		r.Delete("/api/projects/{projectId}/task-statuses/{statusId}", projectH.DeleteTaskStatus)

		r.Get("/api/tasks", taskH.ListAll)
		r.Get("/api/tasks/{id}", taskH.Get)
		r.Post("/api/tasks", taskH.Create)
		r.Post("/api/tasks/batch", taskH.CreateBatch)
		r.Get("/api/projects/{projectId}/tasks", taskH.ListByProject)
		r.Get("/api/projects/{projectId}/tasks/by-key/{taskKey}", taskH.GetByKey)
		r.Put("/api/projects/{projectId}/tasks/reorder", taskH.Reorder)
		r.Put("/api/tasks/{id}", taskH.Update)
		r.Delete("/api/tasks/{id}", taskH.Delete)
		r.Get("/api/tasks/{taskId}/assignees", collabH.ListTaskAssignees)
		r.Post("/api/tasks/{taskId}/assignees", collabH.AddTaskAssignee)
		r.Delete("/api/tasks/{taskId}/assignees/{userId}", collabH.RemoveTaskAssignee)
		r.Get("/api/tasks/{taskId}/comments", collabH.ListTaskComments)
		r.Post("/api/tasks/{taskId}/comments", collabH.CreateTaskComment)
		r.Delete("/api/tasks/{taskId}/comments/{commentId}", collabH.DeleteTaskComment)
		r.Get("/api/tasks/{taskId}/activity", collabH.ListTaskActivity)
		r.Post("/api/projects/{projectId}/presence", collabH.HeartbeatProjectPresence)
		r.Post("/api/tasks/{taskId}/presence", collabH.HeartbeatTaskPresence)

		r.Get("/api/wiki", wikiH.List)
		r.Post("/api/wiki", wikiH.Create)
		r.Get("/api/wiki/{id}", wikiH.Get)
		r.Put("/api/wiki/{id}", wikiH.Update)
		r.Delete("/api/wiki/{id}", wikiH.Delete)

		r.Post("/api/installations", installH.Create)
		r.Put("/api/installations/{id}", installH.Update)
		r.Delete("/api/installations/{id}", installH.Delete)

		r.Get("/api/snippets", snippetH.List)
		r.Post("/api/snippets", snippetH.Create)
		r.Put("/api/snippets/{id}", snippetH.Update)
		r.Delete("/api/snippets/{id}", snippetH.Delete)

		r.Get("/api/activity", activityH.List)
		r.Get("/api/notifications", notificationH.List)
		r.Get("/api/notifications/unread-count", notificationH.UnreadCount)
		r.Post("/api/notifications/{id}/read", notificationH.MarkRead)
		r.Delete("/api/notifications/{id}", notificationH.Delete)

		r.Get("/api/vault/keys", vaultH.GetKeys)
		r.Post("/api/vault/keys", vaultH.CreateKeys)
		r.Put("/api/vault/keys/{id}", vaultH.UpdateKeys)

		r.Get("/api/access/{resourceId}", accessH.GetKey)
		r.Post("/api/access", accessH.Grant)

		r.Get("/api/versions/{resourceId}", versionH.List)
		r.Post("/api/versions", versionH.Create)

		r.Get("/api/users/search", collabH.SearchUsers)
		r.Get("/api/projects/{projectId}/members", collabH.ListMembers)
		r.Post("/api/projects/{projectId}/members", collabH.AddMember)
		r.Put("/api/projects/{projectId}/members/{userId}", collabH.UpdateMemberRole)
		r.Delete("/api/projects/{projectId}/members/{userId}", collabH.RemoveMember)
		r.Get("/api/projects/{projectId}/invitations", collabH.ListInvitations)
		r.Post("/api/projects/{projectId}/invitations", collabH.CreateInvitation)
		r.Delete("/api/projects/{projectId}/invitations/{invitationId}", collabH.CancelInvitation)
		r.Post("/api/invitations/accept", collabH.AcceptInvitation)
		r.Get("/api/projects/{projectId}/files", collabH.ListProjectFiles)
		r.Post("/api/projects/{projectId}/files", collabH.UploadProjectFile)
		r.Get("/api/tasks/{taskId}/files", collabH.ListTaskFiles)
		r.Post("/api/tasks/{taskId}/files", collabH.UploadTaskFile)
		r.Get("/api/files/{fileId}", collabH.DownloadProjectFile)
		r.Delete("/api/files/{fileId}", collabH.DeleteProjectFile)
		r.Get("/api/projects/{projectId}/activity", collabH.ListProjectActivity)
	})

	addr := fmt.Sprintf(":%d", cfg.Port)
	log.Printf("justspace backend listening on %s", addr)
	if err := http.ListenAndServe(addr, r); err != nil {
		log.Fatalf("Server error: %v", err)
	}
}

func corsMiddleware(origin string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origins := strings.Split(origin, ",")
			reqOrigin := r.Header.Get("Origin")
			for _, o := range origins {
				if strings.TrimSpace(o) == reqOrigin {
					w.Header().Set("Access-Control-Allow-Origin", reqOrigin)
					w.Header().Add("Vary", "Origin")
					break
				}
			}
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			w.Header().Set("Access-Control-Max-Age", "86400")
			if r.Method == "OPTIONS" {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
		w.Header().Set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
		if r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https" {
			w.Header().Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
		}
		next.ServeHTTP(w, r)
	})
}
