package pomodoro

import (
	"context"
	"fmt"
)

// TimeTracker is an interface satisfied by timetracking.Service.
// Using an interface avoids an import cycle between the pomodoro and timetracking packages.
type TimeTracker interface {
	AddManualEntry(ctx context.Context, taskID, userID string, durationSeconds int, note string) error
}

// Service handles pomodoro session business logic.
type Service struct {
	repo        Repository
	timeTracker TimeTracker
}

// NewService creates a new pomodoro Service.
func NewService(repo Repository) *Service {
	return &Service{repo: repo}
}

// SetTimeTracker wires in the time tracking dependency post-construction.
func (s *Service) SetTimeTracker(tt TimeTracker) {
	s.timeTracker = tt
}

// Start begins a new pomodoro session. Defaults duration to 25 if 0.
func (s *Service) Start(ctx context.Context, userID string, req StartRequest) (*Session, error) {
	dur := req.DurationMinutes
	if dur <= 0 {
		dur = 25
	}
	session, err := s.repo.Start(ctx, userID, req.TaskID, dur)
	if err != nil {
		return nil, fmt.Errorf("pomodoro.service.Start: %w", err)
	}
	return session, nil
}

// Complete marks a session as completed and, if linked to a task, records a
// time entry so the task's total_time_seconds stays accurate.
func (s *Service) Complete(ctx context.Context, id, userID string) (*Session, error) {
	session, err := s.repo.Complete(ctx, id, userID)
	if err != nil {
		return nil, err
	}

	// Sync the completed session duration into the time tracking system so the
	// task card's "total time" badge reflects pomodoro work.
	if session.TaskID != nil && s.timeTracker != nil {
		durationSecs := session.DurationMinutes * 60
		if tErr := s.timeTracker.AddManualEntry(ctx, *session.TaskID, userID, durationSecs, "Pomodoro session"); tErr != nil {
			// Non-fatal: log would happen at the timetracking layer.
			_ = tErr
		}
	}

	return session, nil
}

// Abandon ends a session without completing it.
func (s *Service) Abandon(ctx context.Context, id, userID string) (*Session, error) {
	return s.repo.Abandon(ctx, id, userID)
}

// List returns the last 50 sessions for the user.
func (s *Service) List(ctx context.Context, userID string) ([]*Session, error) {
	return s.repo.List(ctx, userID)
}

// ActiveSession returns the current active session, if any.
func (s *Service) ActiveSession(ctx context.Context, userID string) (*Session, error) {
	return s.repo.ActiveSession(ctx, userID)
}
