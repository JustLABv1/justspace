package reminders

import (
	"context"
	"log"
	"time"

	"github.com/justlabv1/justspace/backend/internal/repository"
)

// RunAdminAuditRetention keeps the append-only audit log within its documented
// 12-month retention window. Cleanup runs once on startup and once per day.
func RunAdminAuditRetention(repo *repository.Repo) {
	cleanup := func() {
		if err := repo.DeleteExpiredAdminAudit(context.Background()); err != nil {
			log.Printf("admin audit retention error: %v", err)
		}
	}
	cleanup()
	ticker := time.NewTicker(24 * time.Hour)
	defer ticker.Stop()
	for range ticker.C {
		cleanup()
	}
}
