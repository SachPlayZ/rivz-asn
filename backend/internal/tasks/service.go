package tasks

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/SachPlayZ/rivz-asn/backend/internal/activitylog"
	"github.com/SachPlayZ/rivz-asn/backend/internal/groq"
	"github.com/SachPlayZ/rivz-asn/backend/internal/sse"
	"github.com/go-playground/validator/v10"
)

var validate = validator.New()

// NotificationsService is the interface used by tasks.Service to send notifications.
// Using an interface prevents an import cycle (notifications imports sse; tasks imports notifications).
type NotificationsService interface {
	Create(ctx context.Context, userID, nType string, taskID *string, message string)
}

// CalendarSyncService is the interface used to push task events to Google Calendar.
type CalendarSyncService interface {
	SyncTask(ctx context.Context, task *Task) error
	DeleteEvent(ctx context.Context, userID, eventID string) error
}

// DependenciesService is used to check/notify when a task completes.
type DependenciesService interface {
	NotifyUnblocked(ctx context.Context, doneTaskID, ownerUserID string)
}

// WebhooksService fires outbound webhooks on task events.
type WebhooksService interface {
	Fire(ctx context.Context, userID, event string, payload any)
}

// WatchersService notifies watchers on task update.
type WatchersService interface {
	NotifyWatchers(ctx context.Context, taskID, updaterUserID, taskTitle string)
}

// Service handles business logic for task operations.
type Service struct {
	repo          Repository
	activitySvc   *activitylog.Service
	sseBroker     *sse.Broker
	notifSvc      NotificationsService
	depsSvc       DependenciesService
	webhooksSvc   WebhooksService
	watchersSvc   WatchersService
	automationEng AutomationEngine
	calendarSyncSvc CalendarSyncService
}

// AutomationEngine reacts to task lifecycle events (implemented by automations.Service).
// Kept primitive to avoid an import cycle with the automations package.
type AutomationEngine interface {
	OnTaskEvent(ctx context.Context, userID, taskID, event, title, status, priority string)
}

// SetAutomationEngine wires in the automation engine post-construction.
func (s *Service) SetAutomationEngine(eng AutomationEngine) {
	s.automationEng = eng
}

// NewService creates a new tasks Service.
func NewService(repo Repository, activitySvc *activitylog.Service, sseBroker *sse.Broker) *Service {
	return &Service{repo: repo, activitySvc: activitySvc, sseBroker: sseBroker}
}

// SetNotificationsService wires in the notifications dependency post-construction.
func (s *Service) SetNotificationsService(notifSvc NotificationsService) {
	s.notifSvc = notifSvc
}

// SetDependenciesService wires in the dependencies dependency.
func (s *Service) SetDependenciesService(depsSvc DependenciesService) {
	s.depsSvc = depsSvc
}

// SetWebhooksService wires in the webhooks dependency.
func (s *Service) SetWebhooksService(webhooksSvc WebhooksService) {
	s.webhooksSvc = webhooksSvc
}

// SetWatchersService wires in the watchers dependency.
func (s *Service) SetWatchersService(watchersSvc WatchersService) {
	s.watchersSvc = watchersSvc
}

// SetCalendarSyncService wires in the calendar sync dependency post-construction.
func (s *Service) SetCalendarSyncService(calendarSyncSvc CalendarSyncService) {
	s.calendarSyncSvc = calendarSyncSvc
}

// ListForAI implements groq.TasksFetcher.
func (s *Service) ListForAI(ctx context.Context, userID string) ([]*groq.TaskSummary, error) {
	items, err := s.repo.ListForAI(ctx, userID)
	if err != nil {
		return nil, err
	}
	result := make([]*groq.TaskSummary, len(items))
	for i, item := range items {
		result[i] = &groq.TaskSummary{
			ID:       item.ID,
			Title:    item.Title,
			Status:   item.Status,
			DueDate:  item.DueDate,
			Priority: item.Priority,
		}
	}
	return result, nil
}

// UpdateTaskStatus is used by the GitHub webhook to mark a task done.
func (s *Service) UpdateTaskStatus(ctx context.Context, taskID, _ string, status string) error {
	return s.repo.UpdateStatusByID(ctx, taskID, status)
}

// ListAllWithDueDate returns all tasks with due dates (for export).
func (s *Service) ListAllWithDueDate(ctx context.Context, userID string) ([]*Task, error) {
	return s.repo.ListAllWithDueDate(ctx, userID)
}

// CreateTask creates a new task for the given user.
func (s *Service) CreateTask(ctx context.Context, userID string, req CreateRequest) (*Task, error) {
	if err := validate.Struct(req); err != nil {
		return nil, fmt.Errorf("service: validate: %w", err)
	}
	task, err := s.repo.CreateTask(ctx, userID, req)
	if err != nil {
		return nil, fmt.Errorf("service: create task: %w", err)
	}

	if logErr := s.activitySvc.Log(ctx, task.ID, userID, "created", nil); logErr != nil {
		log.Printf("activitylog: create task %s: %v", task.ID, logErr)
	}

	s.sseBroker.Publish(userID, sse.Event{Type: "task.created", Payload: task})

	if s.webhooksSvc != nil {
		go s.webhooksSvc.Fire(ctx, userID, "task.created", task)
	}

	// Notify assignee if assigned to someone else.
	if task.AssigneeID != nil && *task.AssigneeID != userID && s.notifSvc != nil {
		msg := fmt.Sprintf("You were assigned task: %s", task.Title)
		s.notifSvc.Create(ctx, *task.AssigneeID, "assigned", &task.ID, msg)
	}

	if s.automationEng != nil {
		s.automationEng.OnTaskEvent(context.Background(), userID, task.ID, "created", task.Title, task.Status, task.Priority)
	}

	if s.calendarSyncSvc != nil {
		go func() {
			if err := s.calendarSyncSvc.SyncTask(context.Background(), task); err != nil {
				log.Printf("tasks: calendar sync: %v", err)
			}
		}()
	}

	return task, nil
}

// ListTasks returns a paginated, filtered list of tasks for the given user.
func (s *Service) ListTasks(ctx context.Context, userID string, p ListParams) (*ListResult, error) {
	tasks, total, err := s.repo.ListTasks(ctx, userID, p)
	if err != nil {
		return nil, fmt.Errorf("service: list tasks: %w", err)
	}
	if tasks == nil {
		tasks = []*Task{}
	}
	return &ListResult{
		Data:  tasks,
		Page:  p.Page,
		Limit: p.Limit,
		Total: total,
	}, nil
}

// GetTask returns a task by ID, scoped to the given user.
func (s *Service) GetTask(ctx context.Context, id, userID string) (*Task, error) {
	task, err := s.repo.GetTask(ctx, id, userID)
	if err != nil {
		return nil, fmt.Errorf("service: get task: %w", err)
	}
	return task, nil
}

// UpdateTask applies a partial update to a task and logs changed fields.
func (s *Service) UpdateTask(ctx context.Context, id, userID string, req UpdateRequest) (*Task, error) {
	old, err := s.repo.GetTask(ctx, id, userID)
	if err != nil {
		return nil, fmt.Errorf("service: get task for update: %w", err)
	}

	task, err := s.repo.UpdateTask(ctx, id, userID, req)
	if err != nil {
		return nil, fmt.Errorf("service: update task: %w", err)
	}

	changes := buildChanges(old, req)
	if len(changes) > 0 {
		if logErr := s.activitySvc.Log(ctx, task.ID, userID, "updated", changes); logErr != nil {
			log.Printf("activitylog: update task %s: %v", task.ID, logErr)
		}
	}

	s.sseBroker.Publish(userID, sse.Event{Type: "task.updated", Payload: task})

	if s.webhooksSvc != nil {
		event := "task.updated"
		if req.Status != nil && *req.Status == "done" {
			event = "task.completed"
		}
		go s.webhooksSvc.Fire(ctx, userID, event, task)
	}
	if s.watchersSvc != nil {
		go s.watchersSvc.NotifyWatchers(ctx, task.ID, userID, task.Title)
	}

	// Assignee notification.
	if req.AssigneeID != nil && *req.AssigneeID != "" && *req.AssigneeID != userID && s.notifSvc != nil {
		if old.AssigneeID == nil || *old.AssigneeID != *req.AssigneeID {
			msg := fmt.Sprintf("You were assigned task: %s", task.Title)
			s.notifSvc.Create(ctx, *req.AssigneeID, "assigned", &task.ID, msg)
		}
	}

	// Recurring task: if status flipped to done, spawn next instance.
	if req.Status != nil && *req.Status == "done" && task.Recurrence != nil && *task.Recurrence != "" {
		s.spawnRecurrence(ctx, task)
	}

	// Dependencies: check if completing unblocks dependents.
	if req.Status != nil && *req.Status == "done" && s.depsSvc != nil {
		s.depsSvc.NotifyUnblocked(ctx, task.ID, userID)
	}

	if s.automationEng != nil {
		event := "updated"
		if req.Status != nil && (old.Status != *req.Status) {
			event = "status_changed"
		}
		s.automationEng.OnTaskEvent(context.Background(), userID, task.ID, event, task.Title, task.Status, task.Priority)
	}

	if s.calendarSyncSvc != nil {
		go func() {
			if err := s.calendarSyncSvc.SyncTask(context.Background(), task); err != nil {
				log.Printf("tasks: calendar sync: %v", err)
			}
		}()
	}

	return task, nil
}

// DeleteTask removes a task owned by the given user.
func (s *Service) DeleteTask(ctx context.Context, id, userID string) error {
	task, getErr := s.repo.GetTask(ctx, id, userID)
	if getErr == nil && task != nil && task.ExternalEventID != nil && *task.ExternalEventID != "" && s.calendarSyncSvc != nil {
		go func(eventID string) {
			if err := s.calendarSyncSvc.DeleteEvent(context.Background(), userID, eventID); err != nil {
				log.Printf("tasks: calendar delete: %v", err)
			}
		}(*task.ExternalEventID)
	}

	if err := s.repo.DeleteTask(ctx, id, userID); err != nil {
		return fmt.Errorf("service: delete task: %w", err)
	}

	if logErr := s.activitySvc.Log(ctx, id, userID, "deleted", nil); logErr != nil {
		log.Printf("activitylog: delete task %s: %v", id, logErr)
	}

	s.sseBroker.Publish(userID, sse.Event{Type: "task.deleted", Payload: map[string]string{"id": id}})

	if s.webhooksSvc != nil {
		go s.webhooksSvc.Fire(ctx, userID, "task.deleted", map[string]string{"id": id})
	}

	return nil
}

// Reorder bulk-updates sort_order for tasks owned by userID.
func (s *Service) Reorder(ctx context.Context, userID string, items []ReorderItem) error {
	return s.repo.Reorder(ctx, userID, items)
}

// BulkUpdate updates status/priority for multiple tasks.
func (s *Service) BulkUpdate(ctx context.Context, userID string, req BulkUpdateRequest) error {
	if err := s.repo.BulkUpdate(ctx, userID, req); err != nil {
		return err
	}
	s.sseBroker.Publish(userID, sse.Event{Type: "tasks.bulk_updated", Payload: req.IDs})
	return nil
}

// BulkDelete deletes multiple tasks.
func (s *Service) BulkDelete(ctx context.Context, userID string, ids []string) error {
	if err := s.repo.BulkDelete(ctx, userID, ids); err != nil {
		return err
	}
	s.sseBroker.Publish(userID, sse.Event{Type: "tasks.bulk_deleted", Payload: ids})
	return nil
}

// spawnRecurrence clones the task with the next due date.
func (s *Service) spawnRecurrence(ctx context.Context, t *Task) {
	next := advanceDueDate(t.DueDate, *t.Recurrence)
	if next == nil {
		return
	}
	if t.RecurrenceEnd != nil && next.After(*t.RecurrenceEnd) {
		return
	}
	clone := *t
	clone.DueDate = next
	if _, err := s.repo.CloneForRecurrence(ctx, &clone); err != nil {
		log.Printf("tasks: spawn recurrence: %v", err)
		return
	}
	s.sseBroker.Publish(t.UserID, sse.Event{Type: "task.created", Payload: nil})
}

func advanceDueDate(due *time.Time, recurrence string) *time.Time {
	if due == nil {
		return nil
	}
	base := *due
	now := time.Now().UTC().Truncate(24 * time.Hour)
	// If the due date is in the past, advance from today so the new instance
	// appears with a future due date rather than an already-overdue one.
	if base.Before(now) {
		base = now
	}
	var next time.Time
	switch recurrence {
	case "daily":
		next = base.AddDate(0, 0, 1)
	case "weekly":
		next = base.AddDate(0, 0, 7)
	case "monthly":
		next = base.AddDate(0, 1, 0)
	default:
		return nil
	}
	return &next
}

// SpawnMissedRecurrences is called by the scheduler to create new instances for
// completed recurring tasks that never had their next instance spawned
// (e.g. server was down when the task was marked done).
func (s *Service) SpawnMissedRecurrences(ctx context.Context) error {
	tasks, err := s.repo.ListDoneRecurringWithoutChild(ctx)
	if err != nil {
		return fmt.Errorf("service: list done recurring: %w", err)
	}
	for _, t := range tasks {
		s.spawnRecurrence(ctx, t)
	}
	return nil
}

// buildChanges computes a map of changed fields from old task and update request.
func buildChanges(old *Task, req UpdateRequest) map[string][2]interface{} {
	changes := make(map[string][2]interface{})

	if req.Title != nil && *req.Title != old.Title {
		changes["title"] = [2]interface{}{old.Title, *req.Title}
	}
	if req.IsPresent("description") {
		var newDesc string
		if req.Description != nil {
			newDesc = *req.Description
		}
		if newDesc != old.Description {
			changes["description"] = [2]interface{}{old.Description, newDesc}
		}
	}
	if req.Status != nil && *req.Status != old.Status {
		changes["status"] = [2]interface{}{old.Status, *req.Status}
	}
	if req.Priority != nil && *req.Priority != old.Priority {
		changes["priority"] = [2]interface{}{old.Priority, *req.Priority}
	}
	if req.IsPresent("due_date") {
		oldDue := formatDueDate(old.DueDate)
		newDue := formatDueDate(req.DueDate)
		if oldDue != newDue {
			changes["due_date"] = [2]interface{}{oldDue, newDue}
		}
	}

	return changes
}

func formatDueDate(t *time.Time) string {
	if t == nil {
		return ""
	}
	return t.Format(time.RFC3339)
}
