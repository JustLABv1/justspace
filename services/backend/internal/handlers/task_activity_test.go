package handlers

import (
	"testing"
	"time"

	"github.com/justlabv1/justspace/backend/internal/models"
)

func TestSummarizeTaskUpdateListsConcreteChanges(t *testing.T) {
	due := time.Date(2026, time.July, 15, 13, 30, 0, 0, time.UTC)
	before := &models.Task{KanbanStatus: "todo", Priority: "medium", Tags: []string{"backend"}}
	after := &models.Task{KanbanStatus: "in-progress", Priority: "high", Tags: []string{"backend", "urgent"}, Deadline: &due}
	status := "in-progress"
	priority := "high"
	deadline := due.Format(time.RFC3339)
	req := models.UpdateTaskRequest{KanbanStatus: &status, Priority: &priority, Deadline: &deadline, Tags: []string{"backend", "urgent"}}

	summary := summarizeTaskUpdate(before, after, req)
	if summary == nil {
		t.Fatal("expected an activity summary")
	}
	want := "Status changed from Todo to In progress; Priority changed from Medium to High; Due date set to 15 Jul 2026, 13:30 UTC; Tags added urgent"
	if *summary != want {
		t.Fatalf("unexpected summary\nwant: %s\n got: %s", want, *summary)
	}
}

func TestSummarizeTaskUpdateIgnoresUnchangedValues(t *testing.T) {
	title := "Same title"
	task := &models.Task{Title: title}
	if summary := summarizeTaskUpdate(task, task, models.UpdateTaskRequest{Title: &title}); summary != nil {
		t.Fatalf("expected no summary, got %q", *summary)
	}
}
