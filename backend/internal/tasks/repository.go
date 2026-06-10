package tasks

import (
	"context"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Repository defines persistence operations for tasks.
type Repository interface {
	CreateTask(ctx context.Context, userID string, req CreateRequest) (*Task, error)
	ListTasks(ctx context.Context, userID string, p ListParams) ([]*Task, int, error)
	GetTask(ctx context.Context, id, userID string) (*Task, error)
	UpdateTask(ctx context.Context, id, userID string, req UpdateRequest) (*Task, error)
	DeleteTask(ctx context.Context, id, userID string) error
}

// sortColumns is the whitelist of columns allowed in ORDER BY clauses.
var sortColumns = map[string]string{
	"created_at": "created_at",
	"updated_at": "updated_at",
	"due_date":   "due_date",
	"priority":   "priority",
}

type pgRepository struct {
	pool *pgxpool.Pool
}

// NewRepository returns a Postgres-backed Repository.
func NewRepository(pool *pgxpool.Pool) Repository {
	return &pgRepository{pool: pool}
}

// CreateTask inserts a new task and returns the created record.
func (r *pgRepository) CreateTask(ctx context.Context, userID string, req CreateRequest) (*Task, error) {
	status := req.Status
	if status == "" {
		status = "todo"
	}
	priority := req.Priority
	if priority == "" {
		priority = "medium"
	}

	const q = `
		INSERT INTO tasks (user_id, title, description, status, priority, due_date)
		VALUES ($1, $2, $3, $4::task_status, $5::task_priority, $6)
		RETURNING id, user_id, title, description, status, priority, due_date, created_at, updated_at`

	t := &Task{}
	err := r.pool.QueryRow(ctx, q,
		userID, req.Title, req.Description, status, priority, req.DueDate,
	).Scan(&t.ID, &t.UserID, &t.Title, &t.Description, &t.Status, &t.Priority,
		&t.DueDate, &t.CreatedAt, &t.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("tasks: create: %w", err)
	}

	return t, nil
}

// ListTasks returns a page of tasks filtered by the given params, plus total count.
func (r *pgRepository) ListTasks(ctx context.Context, userID string, p ListParams) ([]*Task, int, error) {
	// Normalise pagination defaults.
	if p.Page < 1 {
		p.Page = 1
	}
	if p.Limit < 1 || p.Limit > 100 {
		p.Limit = 20
	}

	// Build WHERE clause dynamically.
	args := []any{userID}
	conds := []string{"user_id = $1"}
	idx := 2

	if p.Status != "" {
		conds = append(conds, fmt.Sprintf("status = $%d::task_status", idx))
		args = append(args, p.Status)
		idx++
	}
	if p.Search != "" {
		conds = append(conds, fmt.Sprintf("title ILIKE $%d", idx))
		args = append(args, "%"+p.Search+"%")
		idx++
	}

	where := strings.Join(conds, " AND ")

	// Resolve sort column from whitelist (prevents SQL injection).
	col, ok := sortColumns[p.Sort]
	if !ok {
		col = "created_at"
	}
	order := "DESC"
	if strings.ToUpper(p.Order) == "ASC" {
		order = "ASC"
	}

	offset := (p.Page - 1) * p.Limit

	// Use a window function to get the total count in one query.
	q := fmt.Sprintf(`
		SELECT id, user_id, title, description, status, priority, due_date,
		       created_at, updated_at,
		       COUNT(*) OVER() AS total_count
		FROM tasks
		WHERE %s
		ORDER BY %s %s NULLS LAST
		LIMIT $%d OFFSET $%d`, where, col, order, idx, idx+1)

	args = append(args, p.Limit, offset)

	rows, err := r.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("tasks: list query: %w", err)
	}
	defer rows.Close()

	var tasks []*Task
	var total int

	for rows.Next() {
		t := &Task{}
		if err := rows.Scan(&t.ID, &t.UserID, &t.Title, &t.Description,
			&t.Status, &t.Priority, &t.DueDate, &t.CreatedAt, &t.UpdatedAt,
			&total); err != nil {
			return nil, 0, fmt.Errorf("tasks: list scan: %w", err)
		}
		tasks = append(tasks, t)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, fmt.Errorf("tasks: list rows: %w", err)
	}

	return tasks, total, nil
}

// GetTask fetches a single task by id, scoped to the owning user.
// Returns an error wrapping pgx.ErrNoRows if not found or not owned.
func (r *pgRepository) GetTask(ctx context.Context, id, userID string) (*Task, error) {
	const q = `
		SELECT id, user_id, title, description, status, priority, due_date,
		       created_at, updated_at
		FROM tasks
		WHERE id = $1 AND user_id = $2`

	t := &Task{}
	err := r.pool.QueryRow(ctx, q, id, userID).
		Scan(&t.ID, &t.UserID, &t.Title, &t.Description, &t.Status, &t.Priority,
			&t.DueDate, &t.CreatedAt, &t.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("tasks: get: %w", err)
	}

	return t, nil
}

// UpdateTask applies a partial update to a task and returns the updated record.
// Only non-nil fields in req are modified.
func (r *pgRepository) UpdateTask(ctx context.Context, id, userID string, req UpdateRequest) (*Task, error) {
	sets := []string{"updated_at = now()"}
	args := []any{}
	idx := 1

	if req.Title != nil {
		sets = append(sets, fmt.Sprintf("title = $%d", idx))
		args = append(args, *req.Title)
		idx++
	}
	if req.Description != nil {
		sets = append(sets, fmt.Sprintf("description = $%d", idx))
		args = append(args, *req.Description)
		idx++
	}
	if req.Status != nil {
		sets = append(sets, fmt.Sprintf("status = $%d::task_status", idx))
		args = append(args, *req.Status)
		idx++
	}
	if req.Priority != nil {
		sets = append(sets, fmt.Sprintf("priority = $%d::task_priority", idx))
		args = append(args, *req.Priority)
		idx++
	}
	if req.DueDate != nil {
		sets = append(sets, fmt.Sprintf("due_date = $%d", idx))
		args = append(args, req.DueDate)
		idx++
	}

	args = append(args, id, userID)

	q := fmt.Sprintf(`
		UPDATE tasks SET %s
		WHERE id = $%d AND user_id = $%d
		RETURNING id, user_id, title, description, status, priority, due_date,
		          created_at, updated_at`,
		strings.Join(sets, ", "), idx, idx+1)

	t := &Task{}
	err := r.pool.QueryRow(ctx, q, args...).
		Scan(&t.ID, &t.UserID, &t.Title, &t.Description, &t.Status, &t.Priority,
			&t.DueDate, &t.CreatedAt, &t.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("tasks: update: %w", err)
	}

	return t, nil
}

// DeleteTask removes a task scoped to the owning user.
func (r *pgRepository) DeleteTask(ctx context.Context, id, userID string) error {
	const q = `DELETE FROM tasks WHERE id = $1 AND user_id = $2`

	tag, err := r.pool.Exec(ctx, q, id, userID)
	if err != nil {
		return fmt.Errorf("tasks: delete: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("tasks: delete: %w", ErrNotFound)
	}

	return nil
}
