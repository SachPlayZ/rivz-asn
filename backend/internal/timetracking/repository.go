package timetracking

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository interface {
	Start(ctx context.Context, taskID, userID string, note string) (*TimeEntry, error)
	Stop(ctx context.Context, id, userID string, note string) (*TimeEntry, error)
	List(ctx context.Context, taskID string) ([]*TimeEntry, error)
	Delete(ctx context.Context, id, userID string) error
	ActiveEntry(ctx context.Context, taskID, userID string) (*TimeEntry, error)
	TotalSeconds(ctx context.Context, taskID string) (int, error)
	// AddManualEntry inserts a pre-computed completed time entry (e.g. from a Pomodoro session).
	AddManualEntry(ctx context.Context, taskID, userID string, durationSeconds int, note string) error
}

type pgRepository struct {
	pool *pgxpool.Pool
}

func NewRepository(pool *pgxpool.Pool) Repository {
	return &pgRepository{pool: pool}
}

func scanEntry(row interface{ Scan(dest ...any) error }) (*TimeEntry, error) {
	e := &TimeEntry{}
	err := row.Scan(
		&e.ID, &e.TaskID, &e.UserID, &e.StartedAt, &e.EndedAt, &e.DurationSeconds, &e.Note, &e.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	return e, nil
}

func (r *pgRepository) Start(ctx context.Context, taskID, userID string, note string) (*TimeEntry, error) {
	const q = `INSERT INTO time_entries (task_id, user_id, note)
		VALUES ($1, $2, $3)
		RETURNING id, task_id, user_id, started_at, ended_at, duration_seconds, note, created_at`
	e, err := scanEntry(r.pool.QueryRow(ctx, q, taskID, userID, note))
	if err != nil {
		return nil, fmt.Errorf("timetracking.start: %w", err)
	}
	return e, nil
}

func (r *pgRepository) Stop(ctx context.Context, id, userID string, note string) (*TimeEntry, error) {
	const q = `UPDATE time_entries
		SET ended_at = now(),
		    duration_seconds = EXTRACT(EPOCH FROM now() - started_at)::int,
		    note = $3
		WHERE id=$1 AND user_id=$2 AND ended_at IS NULL
		RETURNING id, task_id, user_id, started_at, ended_at, duration_seconds, note, created_at`
	e, err := scanEntry(r.pool.QueryRow(ctx, q, id, userID, note))
	if err != nil {
		return nil, fmt.Errorf("timetracking.stop: %w", err)
	}
	return e, nil
}

func (r *pgRepository) List(ctx context.Context, taskID string) ([]*TimeEntry, error) {
	const q = `SELECT id, task_id, user_id, started_at, ended_at, duration_seconds, note, created_at
		FROM time_entries WHERE task_id=$1 ORDER BY started_at DESC`
	rows, err := r.pool.Query(ctx, q, taskID)
	if err != nil {
		return nil, fmt.Errorf("timetracking.list: %w", err)
	}
	defer rows.Close()

	var entries []*TimeEntry
	for rows.Next() {
		e, err := scanEntry(rows)
		if err != nil {
			return nil, fmt.Errorf("timetracking.list scan: %w", err)
		}
		entries = append(entries, e)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("timetracking.list rows: %w", err)
	}
	return entries, nil
}

func (r *pgRepository) Delete(ctx context.Context, id, userID string) error {
	tag, err := r.pool.Exec(ctx, `DELETE FROM time_entries WHERE id=$1 AND user_id=$2`, id, userID)
	if err != nil {
		return fmt.Errorf("timetracking.delete: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("timetracking.delete: %w", ErrNotFound)
	}
	return nil
}

func (r *pgRepository) ActiveEntry(ctx context.Context, taskID, userID string) (*TimeEntry, error) {
	const q = `SELECT id, task_id, user_id, started_at, ended_at, duration_seconds, note, created_at
		FROM time_entries WHERE task_id=$1 AND user_id=$2 AND ended_at IS NULL LIMIT 1`
	e, err := scanEntry(r.pool.QueryRow(ctx, q, taskID, userID))
	if err != nil {
		return nil, fmt.Errorf("timetracking.active: %w", err)
	}
	return e, nil
}

func (r *pgRepository) TotalSeconds(ctx context.Context, taskID string) (int, error) {
	const q = `SELECT COALESCE(SUM(duration_seconds), 0)
		FROM time_entries WHERE task_id=$1 AND ended_at IS NOT NULL`
	var total int
	if err := r.pool.QueryRow(ctx, q, taskID).Scan(&total); err != nil {
		return 0, fmt.Errorf("timetracking.total: %w", err)
	}
	return total, nil
}

// AddManualEntry inserts a completed time entry without an active start/stop flow.
// ended_at is now(); started_at is computed by subtracting durationSeconds.
func (r *pgRepository) AddManualEntry(ctx context.Context, taskID, userID string, durationSeconds int, note string) error {
	const q = `INSERT INTO time_entries (task_id, user_id, started_at, ended_at, duration_seconds, note)
		VALUES ($1, $2, now() - ($3::int * interval '1 second'), now(), $3, $4)`
	_, err := r.pool.Exec(ctx, q, taskID, userID, durationSeconds, note)
	if err != nil {
		return fmt.Errorf("timetracking.add_manual: %w", err)
	}
	return nil
}
