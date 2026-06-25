package timetracking

import (
	"context"
	"fmt"
	"strings"
)

type Service struct{ repo Repository }

func NewService(repo Repository) *Service { return &Service{repo: repo} }

func (s *Service) Start(ctx context.Context, taskID, userID string, note string) (*TimeEntry, error) {
	e, err := s.repo.Start(ctx, taskID, userID, note)
	if err != nil {
		return nil, fmt.Errorf("timetracking.service.start: %w", err)
	}
	return e, nil
}

func (s *Service) Stop(ctx context.Context, id, userID string, note string) (*TimeEntry, error) {
	e, err := s.repo.Stop(ctx, id, userID, note)
	if err != nil {
		if strings.Contains(err.Error(), "no rows") {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("timetracking.service.stop: %w", err)
	}
	return e, nil
}

func (s *Service) List(ctx context.Context, taskID string) ([]*TimeEntry, error) {
	entries, err := s.repo.List(ctx, taskID)
	if err != nil {
		return nil, fmt.Errorf("timetracking.service.list: %w", err)
	}
	if entries == nil {
		entries = []*TimeEntry{}
	}
	return entries, nil
}

func (s *Service) Delete(ctx context.Context, id, userID string) error {
	err := s.repo.Delete(ctx, id, userID)
	if err != nil {
		if strings.Contains(err.Error(), "no rows") {
			return ErrNotFound
		}
		return fmt.Errorf("timetracking.service.delete: %w", err)
	}
	return nil
}

func (s *Service) ActiveEntry(ctx context.Context, taskID, userID string) (*TimeEntry, error) {
	e, err := s.repo.ActiveEntry(ctx, taskID, userID)
	if err != nil {
		if strings.Contains(err.Error(), "no rows") {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("timetracking.service.active: %w", err)
	}
	return e, nil
}

func (s *Service) TotalSeconds(ctx context.Context, taskID string) (int, error) {
	total, err := s.repo.TotalSeconds(ctx, taskID)
	if err != nil {
		return 0, fmt.Errorf("timetracking.service.total: %w", err)
	}
	return total, nil
}

// AddManualEntry records a pre-computed completed time entry (e.g. from a Pomodoro session).
func (s *Service) AddManualEntry(ctx context.Context, taskID, userID string, durationSeconds int, note string) error {
	if err := s.repo.AddManualEntry(ctx, taskID, userID, durationSeconds, note); err != nil {
		return fmt.Errorf("timetracking.service.add_manual: %w", err)
	}
	return nil
}
