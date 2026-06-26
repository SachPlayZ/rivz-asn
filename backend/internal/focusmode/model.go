package focusmode

import "time"

// Session represents a focus (deep-work) session record.
type Session struct {
	ID          string     `json:"id"`
	UserID      string     `json:"user_id"`
	TaskID      *string    `json:"task_id"`
	TaskTitle   *string    `json:"task_title,omitempty"`
	StartedAt   time.Time  `json:"started_at"`
	EndedAt     *time.Time `json:"ended_at"`
	DurationMin *int       `json:"duration_min"`
	Notes       string     `json:"notes"`
	Intention   string     `json:"intention"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
}

// StartRequest initiates a new focus session.
type StartRequest struct {
	TaskID    *string `json:"task_id"`
	Intention string  `json:"intention"`
}

// EndRequest finalises an active session.
type EndRequest struct {
	Notes string `json:"notes"`
}

// UpdateRequest allows partial updates to a session.
type UpdateRequest struct {
	Notes     *string `json:"notes"`
	Intention *string `json:"intention"`
}

// ListParams filters and paginates sessions.
type ListParams struct {
	Page  int
	Limit int
}

// ListResult is the paginated response for sessions.
type ListResult struct {
	Data  []*Session `json:"data"`
	Page  int        `json:"page"`
	Limit int        `json:"limit"`
	Total int        `json:"total"`
}

// Stats gives summary metrics for focus sessions.
type Stats struct {
	TotalSessions int `json:"total_sessions"`
	TotalMinutes  int `json:"total_minutes"`
	CurrentStreak int `json:"current_streak"`
	LongestStreak int `json:"longest_streak"`
}
