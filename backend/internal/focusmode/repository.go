package focusmode

import (
	"context"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Repository provides CRUD operations for focus sessions.
type Repository struct {
	db *pgxpool.Pool
}

// NewRepository creates a new Repository.
func NewRepository(db *pgxpool.Pool) *Repository {
	return &Repository{db: db}
}

// Create inserts a new focus session.
func (r *Repository) Create(ctx context.Context, s *Session) error {
	query := `
		INSERT INTO focus_sessions (user_id, task_id, started_at, intention)
		VALUES ($1, $2, $3, $4)
		RETURNING id, created_at, updated_at
	`
	return r.db.QueryRow(ctx, query, s.UserID, s.TaskID, s.StartedAt, s.Intention).
		Scan(&s.ID, &s.CreatedAt, &s.UpdatedAt)
}

// GetByID retrieves a session by ID.
func (r *Repository) GetByID(ctx context.Context, id, userID string) (*Session, error) {
	query := `
		SELECT fs.id, fs.user_id, fs.task_id, t.title, fs.started_at, fs.ended_at,
		       fs.duration_min, fres.notes, fs.intention, fs.created_at, fs.updated_at
		FROM focus_sessions fs
		LEFT JOIN tasks t ON fs.task_id = t.id
		WHERE fs.id = $1 AND fs.user_id = $2
	`
	var s Session
	var taskTitle *string
	err := r.db.QueryRow(ctx, query, id, userID).Scan(
		&s.ID, &s.UserID, &s.TaskID, &taskTitle,
		&s.StartedAt, &s.EndedAt, &s.DurationMin,
		&s.Notes, &s.Intention, &s.CreatedAt, &s.UpdatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, fmt.Errorf("session not found")
		}
		return nil, err
	}
	s.TaskTitle = taskTitle
	return &s, nil
}

// GetActive retrieves the currently active (unended) session for a user.
func (r *Repository) GetActive(ctx context.Context, userID string) (*Session, error) {
	query := `
		SELECT fs.id, fs.user_id, fs.task_id, t.title, fs.started_at, fs.ended_at,
		       fs.duration_min, fs.notes, fs.intention, fs.created_at, fs.updated_at
		FROM focus_sessions fs
		LEFT JOIN tasks t ON fs.task_id = t.id
		WHERE fs.user_id = $1 AND fs.ended_at IS NULL
		ORDER BY fs.started_at DESC
		LIMIT 1
	`
	var s Session
	var taskTitle *string
	err := r.db.QueryRow(ctx, query, userID).Scan(
		&s.ID, &s.UserID, &s.TaskID, &taskTitle,
		&s.StartedAt, &s.EndedAt, &s.DurationMin,
		&s.Notes, &s.Intention, &s.CreatedAt, &s.UpdatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	s.TaskTitle = taskTitle
	return &s, nil
}

// End marks a session as finished.
func (r *Repository) End(ctx context.Context, id, userID string, notes string, durationMin int) error {
	query := `
		UPDATE focus_sessions
		SET ended_at = NOW(), duration_min = $1, notes = $2, updated_at = NOW()
		WHERE id = $3 AND user_id = $4 AND ended_at IS NULL
	`
	cmd, err := r.db.Exec(ctx, query, durationMin, notes, id, userID)
	if err != nil {
		return err
	}
	if cmd.RowsAffected() == 0 {
		return fmt.Errorf("no active session found")
	}
	return nil
}

// List retrieves paginated sessions for a user.
func (r *Repository) List(ctx context.Context, userID string, params ListParams) ([]*Session, int, error) {
	if params.Page <= 0 {
		params.Page = 1
	}
	if params.Limit <= 0 {
		params.Limit = 20
	}
	offset := (params.Page - 1) * params.Limit

	var total int
	err := r.db.QueryRow(ctx, `SELECT COUNT(*) FROM focus_sessions WHERE user_id = $1`, userID).Scan(&total)
	if err != nil {
		return nil, 0, err
	}

	query := `
		SELECT fs.id, fs.user_id, fs.task_id, t.title, fs.started_at, fs.ended_at,
		       fs.duration_min, fs.notes, fs.intention, fs.created_at, fs.updated_at
		FROM focus_sessions fs
		LEFT JOIN tasks t ON fs.task_id = t.id
		WHERE fs.user_id = $1
		ORDER BY fs.started_at DESC
		LIMIT $2 OFFSET $3
	`
	rows, err := r.db.Query(ctx, query, userID, params.Limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var sessions []*Session
	for rows.Next() {
		var s Session
		var taskTitle *string
		err := rows.Scan(
			&s.ID, &s.UserID, &s.TaskID, &taskTitle,
			&s.StartedAt, &s.EndedAt, &s.DurationMin,
			&s.Notes, &s.Intention, &s.CreatedAt, &s.UpdatedAt,
		)
		if err != nil {
			return nil, 0, err
		}
		s.TaskTitle = taskTitle
		sessions = append(sessions, &s)
	}

	return sessions, total, rows.Err()
}

// Update modifies a session's notes/intention.
func (r *Repository) Update(ctx context.Context, id, userID string, req *UpdateRequest) error {
	var setParts []string
	var args []interface{}

	setParts = append(setParts, "notes = $1")
	args = append(args, req.Notes)

	if req.Intention != nil {
		setParts = append(setParts, "intention = $2")
		args = append(args, *req.Intention)
	}

	setParts = append(setParts, "updated_at = NOW()")
	
	args = append(args, id, userID)
	
	query := fmt.Sprintf(
		"UPDATE focus_sessions SET %s WHERE id = $%d AND user_id = $%d",
		strings.Join(setParts, ", "),
		len(args)-1,
		len(args),
	)

	cmd, err := r.db.Exec(ctx, query, args...)
	if err != nil {
		return err
	}
	if cmd.RowsAffected() == 0 {
		return fmt.Errorf("session not found")
	}
	return nil
}

// Delete removes a session permanently.
func (r *Repository) Delete(ctx context.Context, id, userID string) error {
	query := `DELETE FROM focus_sessions WHERE id = $1 AND user_id = $2`
	cmd, err := r.db.Exec(ctx, query, id, userID)
	if err != nil {
		return err
	}
	if cmd.RowsAffected() == 0 {
		return fmt.Errorf("session not found")
	}
	return nil
}

// SessionStats retrieves summary metrics for focus sessions.
func (r *Repository) SessionStats(ctx context.Context, userID string) (*Stats, error) {
	query := `
		SELECT
			COUNT(*),
			COALESCE(SUM(duration_min), 0)
		FROM focus_sessions
		WHERE user_id = $1 AND ended_at IS NOT NULL
	`
	var stats Stats
	err := r.db.QueryRow(ctx, query, userID).Scan(&stats.TotalSessions, &stats.TotalMinutes)
	if err != nil {
		return nil, err
	}

	// Compute streaks based on distinct days a session was started.
	// Consecutive days share the same (d - row_number) value, so we group by it.
	streakQuery := `
		WITH days AS (
			SELECT DISTINCT DATE(started_at) AS d
			FROM focus_sessions
			WHERE user_id = $1 AND ended_at IS NOT NULL
		),
		grouped AS (
			SELECT d,
				d - ((ROW_NUMBER() OVER (ORDER BY d))::int || ' days')::interval AS grp
			FROM days
		)
		SELECT COUNT(*) AS streak
		FROM grouped
		GROUP BY grp
		ORDER BY MIN(d) DESC
		LIMIT 1
	`
	var currentStreak int
	if err := r.db.QueryRow(ctx, streakQuery, userID).Scan(&currentStreak); err != nil && err != pgx.ErrNoRows {
		return nil, err
	}
	stats.CurrentStreak = currentStreak

	longestQuery := `
		WITH days AS (
			SELECT DISTINCT DATE(started_at) AS d
			FROM focus_sessions
			WHERE user_id = $1 AND ended_at IS NOT NULL
		),
		grouped AS (
			SELECT d,
				d - ((ROW_NUMBER() OVER (ORDER BY d))::int || ' days')::interval AS grp
			FROM days
		)
		SELECT COUNT(*) AS streak
		FROM grouped
		GROUP BY grp
		ORDER BY streak DESC
		LIMIT 1
	`
	var longestStreak int
	if err := r.db.QueryRow(ctx, longestQuery, userID).Scan(&longestStreak); err != nil && err != pgx.ErrNoRows {
		return nil, err
	}
	stats.LongestStreak = longestStreak

	return &stats, nil
}
