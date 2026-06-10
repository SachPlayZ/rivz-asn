// Package tasks implements task management: models, persistence, business logic,
// and HTTP handlers.
package tasks

import "time"

// Task represents a task record as stored in the database.
type Task struct {
	ID          string     `json:"id"`
	UserID      string     `json:"user_id"`
	Title       string     `json:"title"`
	Description string     `json:"description"`
	Status      string     `json:"status"`
	Priority    string     `json:"priority"`
	DueDate     *time.Time `json:"due_date"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
}

// CreateRequest contains the fields for creating a new task.
type CreateRequest struct {
	Title       string     `json:"title"       validate:"required,min=1"`
	Description string     `json:"description"`
	Status      string     `json:"status"      validate:"omitempty,oneof=todo in_progress done"`
	Priority    string     `json:"priority"    validate:"omitempty,oneof=low medium high"`
	DueDate     *time.Time `json:"due_date"`
}

// UpdateRequest contains the fields for a partial task update.
// Pointer fields are only updated when non-nil.
type UpdateRequest struct {
	Title       *string    `json:"title"       validate:"omitempty,min=1"`
	Description *string    `json:"description"`
	Status      *string    `json:"status"      validate:"omitempty,oneof=todo in_progress done"`
	Priority    *string    `json:"priority"    validate:"omitempty,oneof=low medium high"`
	DueDate     *time.Time `json:"due_date"`
}

// ListParams describes filters, sorting, and pagination for listing tasks.
type ListParams struct {
	Status string
	Search string
	Sort   string
	Order  string
	Page   int
	Limit  int
}

// ListResult is the paginated response envelope for task lists.
type ListResult struct {
	Data  []*Task `json:"data"`
	Page  int     `json:"page"`
	Limit int     `json:"limit"`
	Total int     `json:"total"`
}
