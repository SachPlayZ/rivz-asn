package activitylog

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Repository defines persistence operations for activity logs.
type Repository interface {
	Insert(ctx context.Context, taskID, userID, action string, changes json.RawMessage) error
	ListByTask(ctx context.Context, taskID string) ([]*ActivityLog, error)
	ListByUser(ctx context.Context, userID string) ([]*ActivityLogWithTask, error)
}

type pgRepository struct {
	pool *pgxpool.Pool
}

// NewRepository returns a Postgres-backed Repository.
func NewRepository(pool *pgxpool.Pool) Repository {
	return &pgRepository{pool: pool}
}

// Insert records a new activity log entry.
func (r *pgRepository) Insert(ctx context.Context, taskID, userID, action string, changes json.RawMessage) error {
	const q = `
		INSERT INTO activity_logs (task_id, user_id, action, changes)
		VALUES ($1, $2, $3, $4)`

	_, err := r.pool.Exec(ctx, q, taskID, userID, action, changes)
	if err != nil {
		return fmt.Errorf("activitylog: insert: %w", err)
	}
	return nil
}

// ListByTask returns all activity logs for a given task, ordered by creation time ascending.
func (r *pgRepository) ListByTask(ctx context.Context, taskID string) ([]*ActivityLog, error) {
	const q = `
		SELECT id, task_id, user_id, action, changes, created_at
		FROM activity_logs
		WHERE task_id = $1
		ORDER BY created_at ASC`

	rows, err := r.pool.Query(ctx, q, taskID)
	if err != nil {
		return nil, fmt.Errorf("activitylog: list by task: %w", err)
	}
	defer rows.Close()

	var logs []*ActivityLog
	for rows.Next() {
		l := &ActivityLog{}
		if err := rows.Scan(&l.ID, &l.TaskID, &l.UserID, &l.Action, &l.Changes, &l.CreatedAt); err != nil {
			return nil, fmt.Errorf("activitylog: scan: %w", err)
		}
		logs = append(logs, l)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("activitylog: rows: %w", err)
	}

	if logs == nil {
		logs = []*ActivityLog{}
	}
	return logs, nil
}

// ListByUser returns the most recent activity logs for all tasks belonging to a user,
// joined with the task title (falls back to "[deleted]" if the task was removed).
func (r *pgRepository) ListByUser(ctx context.Context, userID string) ([]*ActivityLogWithTask, error) {
	const q = `
		SELECT al.id, al.task_id, al.user_id, al.action, al.changes, al.created_at,
		       COALESCE(t.title, '[deleted]') AS task_title
		FROM activity_logs al
		LEFT JOIN tasks t ON t.id = al.task_id
		WHERE al.user_id = $1
		ORDER BY al.created_at DESC
		LIMIT 500`

	rows, err := r.pool.Query(ctx, q, userID)
	if err != nil {
		return nil, fmt.Errorf("activitylog: list by user: %w", err)
	}
	defer rows.Close()

	var logs []*ActivityLogWithTask
	for rows.Next() {
		l := &ActivityLogWithTask{}
		if err := rows.Scan(&l.ID, &l.TaskID, &l.UserID, &l.Action, &l.Changes, &l.CreatedAt, &l.TaskTitle); err != nil {
			return nil, fmt.Errorf("activitylog: scan: %w", err)
		}
		logs = append(logs, l)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("activitylog: rows: %w", err)
	}

	if logs == nil {
		logs = []*ActivityLogWithTask{}
	}
	return logs, nil
}
