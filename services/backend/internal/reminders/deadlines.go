package reminders

import (
	"context"
	"log"
	"time"

	"github.com/justlabv1/justspace/backend/internal/models"
	"github.com/justlabv1/justspace/backend/internal/repository"
	"github.com/justlabv1/justspace/backend/internal/websocket"
)

const reminderWindow = 2 * time.Minute

type DeadlineService struct {
	repo *repository.Repo
	hub  *websocket.Hub
}

func NewDeadlineService(repo *repository.Repo, hub *websocket.Hub) *DeadlineService {
	return &DeadlineService{repo: repo, hub: hub}
}

func (s *DeadlineService) Run() {
	s.check(context.Background())
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()
	for range ticker.C {
		s.check(context.Background())
	}
}

func reminderType(deadline, now time.Time) string {
	diff := deadline.Sub(now)
	for _, threshold := range []struct {
		duration time.Duration
		kind     string
	}{
		{24 * time.Hour, "deadline_24h"},
		{4 * time.Hour, "deadline_4h"},
	} {
		if diff <= threshold.duration+reminderWindow && diff >= threshold.duration-reminderWindow {
			return threshold.kind
		}
	}
	if diff <= 0 && diff >= -reminderWindow {
		return "deadline_due"
	}
	return ""
}

func (s *DeadlineService) check(ctx context.Context) {
	now := time.Now()
	tasks, err := s.repo.ListDeadlineReminderTasks(ctx, now.Add(24*time.Hour+reminderWindow))
	if err != nil {
		log.Printf("deadline reminder query error: %v", err)
		return
	}
	for _, task := range tasks {
		if task.Deadline == nil {
			continue
		}
		kind := reminderType(*task.Deadline, now)
		if kind == "" {
			continue
		}
		recipients, err := s.repo.ListDeadlineRecipients(ctx, task.ID)
		if err != nil {
			log.Printf("deadline reminder recipients error: %v", err)
			continue
		}
		for _, recipientID := range recipients {
			notification, err := s.repo.CreateDeadlineNotification(ctx, recipientID, task.UserID, kind, task.ProjectID, task.ID, *task.Deadline)
			if err != nil {
				log.Printf("deadline notification error: %v", err)
				continue
			}
			if notification != nil {
				s.hub.Broadcast(recipientID, models.WSEvent{Type: "create", Collection: "notifications", Document: notification, UserID: task.UserID})
			}
		}
	}
}
