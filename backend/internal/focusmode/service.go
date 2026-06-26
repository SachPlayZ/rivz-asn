package focusmode

import (
	"context"
	"time"
)

// Service handles business logic for focus sessions.
type Service struct {
	repo *Repository
}

// NewService creates a new focus sessions service.
func NewService(repo *Repository) *Service {
	return &Service{repo: repo}
}

// Start begins a new focus session for a user.
func (s *Service) Start(ctx context.Context, userID string, req *StartRequest) (*Session, error) {
	active, err := s.repo.GetActive(ctx, userID)
	if err != nil {
		return nil, err
	}
	if active != nil {
		return nil, &ActiveSessionError{SessionID: active.ID, StartedAt: active.StartedAt}
	}

	session := &Session{
		UserID:    userID,
		TaskID:    req.TaskID,
		StartedAt: time.Now(),
		Intention: req.Intention,
	}
	if err := s.repo.Create(ctx, session); err != nil {
		return nil, err
	}
	return session, nil
}

// End completes a user's active focus session.
func (s *Service) End(ctx context.Context, userID string, req *EndRequest) (*Session, error) {
	active, err := s.repo.GetActive(ctx, userID)
	if err != nil {
		return nil, err
	}
	if active == nil {
		return nil, &NoActiveSessionError{}
	}

	duration := int(time.Since(active.StartedAt).Minutes())
	if duration < 1 {
		duration = 1
	}

	if err := s.repo.End(ctx, active.ID, userID, req.Notes, duration); err != nil {
		return nil, err
	}

	return s.repo.GetByID(ctx, active.ID, userID)
}

// GetActive retrieves the current active session for a user.
func (s *Service) GetActive(ctx context.Context, userID string) (*Session, error) {
	return s.repo.GetActive(ctx, userID)
}

// List returns paginated sessions for a user.
func (s *Service) List(ctx context.Context, userID string, params ListParams) (*ListResult, error) {
	sessions, total, err := s.repo.List(ctx, userID, params)
	if err != nil {
		return nil, err
	}
	return &ListResult{
		Data:  sessions,
		Page:  params.Page,
		Limit: params.Limit,
		Total: total,
	}, nil
}

// Update modifies a session's notes/intention.
func (s *Service) Update(ctx context.Context, id, userID string, req *UpdateRequest) error {
	return s.repo.Update(ctx, id, userID, req)
}

// Delete removes a session.
func (s *Service) Delete(ctx context.Context, id, userID string) error {
	return s.repo.Delete(ctx, id, userID)
}

// GetByID retrieves a single session by ID.
func (s *Service) GetByID(ctx context.Context, id, userID string) (*Session, error) {
	return s.repo.GetByID(ctx, id, userID)
}

// Stats returns summary metrics.
func (s *Service) Stats(ctx context.Context, userID string) (*Stats, error) {
	return s.repo.SessionStats(ctx, userID)
}

// ActiveSessionError is returned when a session is already active.
type ActiveSessionError struct {
	SessionID string    `json:"session_id"`
	StartedAt time.Time `json:"started_at"`
}

func (e *ActiveSessionError) Error() string {
	return "focus session already active"
}

// NoActiveSessionError is returned when trying to end with no active session.
type NoActiveSessionError struct{}

func (e *NoActiveSessionError) Error() string {
	return "no active focus session"
}
