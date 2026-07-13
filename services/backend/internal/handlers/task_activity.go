package handlers

import (
	"fmt"
	"slices"
	"strings"
	"time"

	"github.com/justlabv1/justspace/backend/internal/models"
)

func summarizeTaskUpdate(before, after *models.Task, req models.UpdateTaskRequest) *string {
	changes := make([]string, 0, 8)

	if req.Title != nil && before.Title != after.Title {
		changes = append(changes, "Title changed")
	}
	if req.Description != nil && before.Description != after.Description {
		switch {
		case after.Description == "":
			changes = append(changes, "Description removed")
		case before.Description == "":
			changes = append(changes, "Description added")
		default:
			changes = append(changes, "Description updated")
		}
	}
	if req.KanbanStatus != nil && before.KanbanStatus != after.KanbanStatus {
		changes = append(changes, fmt.Sprintf("Status changed from %s to %s", humanizeTaskValue(before.KanbanStatus), humanizeTaskValue(after.KanbanStatus)))
	}
	if req.Completed != nil && before.Completed != after.Completed {
		if after.Completed {
			changes = append(changes, "Marked complete")
		} else {
			changes = append(changes, "Reopened")
		}
	}
	if req.Priority != nil && before.Priority != after.Priority {
		changes = append(changes, fmt.Sprintf("Priority changed from %s to %s", humanizeTaskValue(before.Priority), humanizeTaskValue(after.Priority)))
	}
	if req.Deadline != nil && !sameTime(before.Deadline, after.Deadline) {
		switch {
		case after.Deadline == nil:
			changes = append(changes, "Due date removed")
		case before.Deadline == nil:
			changes = append(changes, fmt.Sprintf("Due date set to %s", formatActivityDate(*after.Deadline)))
		default:
			changes = append(changes, fmt.Sprintf("Due date changed to %s", formatActivityDate(*after.Deadline)))
		}
	}
	if req.Tags != nil && !slices.Equal(before.Tags, after.Tags) {
		changes = append(changes, summarizeStringListChange("Tags", before.Tags, after.Tags))
	}
	if req.Dependencies != nil && !slices.Equal(before.Dependencies, after.Dependencies) {
		changes = append(changes, fmt.Sprintf("Dependencies changed from %d to %d", len(before.Dependencies), len(after.Dependencies)))
	}
	if req.Recurrence != nil && !equalOptionalString(before.Recurrence, after.Recurrence) {
		if after.Recurrence == nil || strings.TrimSpace(*after.Recurrence) == "" {
			changes = append(changes, "Recurrence removed")
		} else {
			changes = append(changes, "Recurrence updated")
		}
	}

	if len(changes) == 0 {
		return nil
	}
	summary := strings.Join(changes, "; ")
	return &summary
}

func humanizeTaskValue(value string) string {
	value = strings.TrimSpace(strings.ReplaceAll(strings.ReplaceAll(value, "-", " "), "_", " "))
	if value == "" {
		return "None"
	}
	return strings.ToUpper(value[:1]) + value[1:]
}

func summarizeStringListChange(label string, before, after []string) string {
	beforeSet := make(map[string]struct{}, len(before))
	afterSet := make(map[string]struct{}, len(after))
	for _, value := range before {
		beforeSet[value] = struct{}{}
	}
	for _, value := range after {
		afterSet[value] = struct{}{}
	}
	added := make([]string, 0)
	removed := make([]string, 0)
	for _, value := range after {
		if _, exists := beforeSet[value]; !exists {
			added = append(added, value)
		}
	}
	for _, value := range before {
		if _, exists := afterSet[value]; !exists {
			removed = append(removed, value)
		}
	}

	parts := make([]string, 0, 2)
	if len(added) > 0 {
		parts = append(parts, "added "+strings.Join(added, ", "))
	}
	if len(removed) > 0 {
		parts = append(parts, "removed "+strings.Join(removed, ", "))
	}
	if len(parts) == 0 {
		return label + " reordered"
	}
	return label + " " + strings.Join(parts, "; ")
}

func sameTime(left, right *time.Time) bool {
	if left == nil || right == nil {
		return left == right
	}
	return left.Equal(*right)
}

func formatActivityDate(value time.Time) string {
	return value.UTC().Format("2 Jan 2006, 15:04 UTC")
}

func equalOptionalString(left, right *string) bool {
	if left == nil || right == nil {
		return left == right
	}
	return *left == *right
}
