package tasks

import (
	"context"
	"fmt"
)

// Service handles business logic for task operations.
type Service struct {
	repo Repository
}

// NewService creates a new tasks Service.
func NewService(repo Repository) *Service {
	return &Service{repo: repo}
}

// CreateTask creates a new task for the given user.
func (s *Service) CreateTask(ctx context.Context, userID string, req CreateRequest) (*Task, error) {
	task, err := s.repo.CreateTask(ctx, userID, req)
	if err != nil {
		return nil, fmt.Errorf("service: create task: %w", err)
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

// UpdateTask applies a partial update to a task.
func (s *Service) UpdateTask(ctx context.Context, id, userID string, req UpdateRequest) (*Task, error) {
	task, err := s.repo.UpdateTask(ctx, id, userID, req)
	if err != nil {
		return nil, fmt.Errorf("service: update task: %w", err)
	}
	return task, nil
}

// DeleteTask removes a task owned by the given user.
func (s *Service) DeleteTask(ctx context.Context, id, userID string) error {
	if err := s.repo.DeleteTask(ctx, id, userID); err != nil {
		return fmt.Errorf("service: delete task: %w", err)
	}
	return nil
}
