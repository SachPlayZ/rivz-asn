package activitylog

import (
	"context"
	"encoding/json"
	"fmt"
)

// Service handles business logic for activity logging.
type Service struct {
	repo Repository
}

// NewService creates a new activitylog Service.
func NewService(repo Repository) *Service {
	return &Service{repo: repo}
}

// Log records an activity event. Errors are returned but callers should treat
// them as best-effort (log and continue rather than failing the parent op).
func (s *Service) Log(ctx context.Context, taskID, userID, action string, changes interface{}) error {
	var raw json.RawMessage
	if changes != nil {
		b, err := json.Marshal(changes)
		if err != nil {
			return fmt.Errorf("activitylog: marshal changes: %w", err)
		}
		raw = json.RawMessage(b)
	}
	return s.repo.Insert(ctx, taskID, userID, action, raw)
}

// ListByTask returns all activity logs for a given task.
func (s *Service) ListByTask(ctx context.Context, taskID string) ([]*ActivityLog, error) {
	return s.repo.ListByTask(ctx, taskID)
}

// ListByUser returns all recent activity logs across all tasks for a given user.
func (s *Service) ListByUser(ctx context.Context, userID string) ([]*ActivityLogWithTask, error) {
	return s.repo.ListByUser(ctx, userID)
}
