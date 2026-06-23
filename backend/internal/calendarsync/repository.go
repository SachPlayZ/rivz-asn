package calendarsync

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrNotFound = errors.New("connection not found")

// Repository manages database interaction for Google Calendar connections.
type Repository struct {
	pool *pgxpool.Pool
}

// NewRepository creates a new Repository.
func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

// GetConnection fetches a user's Google Calendar connection.
func (r *Repository) GetConnection(ctx context.Context, userID string) (*CalendarConnection, error) {
	conn := &CalendarConnection{}
	err := r.pool.QueryRow(ctx,
		`SELECT id, user_id, provider, email, access_token, refresh_token, expiry, google_calendar_id, sync_token, created_at, updated_at
		 FROM calendar_connections WHERE user_id=$1 AND provider='google'`, userID).
		Scan(&conn.ID, &conn.UserID, &conn.Provider, &conn.Email, &conn.AccessToken, &conn.RefreshToken, &conn.Expiry, &conn.GoogleCalendarID, &conn.SyncToken, &conn.CreatedAt, &conn.UpdatedAt)
	if err == pgx.ErrNoRows {
		return nil, ErrNotFound
	}
	return conn, err
}

// SaveConnection stores or updates a user's Google Calendar connection.
func (r *Repository) SaveConnection(ctx context.Context, userID, email, accessToken, refreshToken string, expiry time.Time) (*CalendarConnection, error) {
	conn := &CalendarConnection{}
	err := r.pool.QueryRow(ctx,
		`INSERT INTO calendar_connections (user_id, provider, email, access_token, refresh_token, expiry)
		 VALUES ($1, 'google', $2, $3, $4, $5)
		 ON CONFLICT (user_id, provider) DO UPDATE SET
		   email=EXCLUDED.email,
		   access_token=EXCLUDED.access_token,
		   refresh_token=EXCLUDED.refresh_token,
		   expiry=EXCLUDED.expiry,
		   updated_at=now()
		 RETURNING id, user_id, provider, email, access_token, refresh_token, expiry, google_calendar_id, sync_token, created_at, updated_at`,
		userID, email, accessToken, refreshToken, expiry).
		Scan(&conn.ID, &conn.UserID, &conn.Provider, &conn.Email, &conn.AccessToken, &conn.RefreshToken, &conn.Expiry, &conn.GoogleCalendarID, &conn.SyncToken, &conn.CreatedAt, &conn.UpdatedAt)
	return conn, err
}

// ConnectTx saves/updates the connection and sets google_calendar_id atomically.
func (r *Repository) ConnectTx(ctx context.Context, userID, email, accessToken, refreshToken string, expiry time.Time, calendarID string) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	_, err = tx.Exec(ctx,
		`INSERT INTO calendar_connections (user_id, provider, email, access_token, refresh_token, expiry)
		 VALUES ($1, 'google', $2, $3, $4, $5)
		 ON CONFLICT (user_id, provider) DO UPDATE SET
		   email=EXCLUDED.email,
		   access_token=EXCLUDED.access_token,
		   refresh_token=EXCLUDED.refresh_token,
		   expiry=EXCLUDED.expiry,
		   updated_at=now()`,
		userID, email, accessToken, refreshToken, expiry)
	if err != nil {
		return err
	}

	_, err = tx.Exec(ctx,
		`UPDATE calendar_connections SET google_calendar_id=$1, updated_at=now()
		 WHERE user_id=$2 AND provider='google'`, calendarID, userID)
	if err != nil {
		return err
	}

	return tx.Commit(ctx)
}

// UpdateAccessToken updates the Google access token and expiry after a refresh.
func (r *Repository) UpdateAccessToken(ctx context.Context, userID, accessToken string, expiry time.Time) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE calendar_connections SET access_token=$1, expiry=$2, updated_at=now()
		 WHERE user_id=$3 AND provider='google'`, accessToken, expiry, userID)
	return err
}

// UpdateCalendarID sets the google calendar id for custom calendar.
func (r *Repository) UpdateCalendarID(ctx context.Context, userID, calendarID string) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE calendar_connections SET google_calendar_id=$1, updated_at=now()
		 WHERE user_id=$2 AND provider='google'`, calendarID, userID)
	return err
}

// UpdateSyncToken updates the sync token for incremental events polling.
func (r *Repository) UpdateSyncToken(ctx context.Context, userID string, syncToken *string) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE calendar_connections SET sync_token=$1, updated_at=now()
		 WHERE user_id=$2 AND provider='google'`, syncToken, userID)
	return err
}

// ListConnections lists all connections for background scheduling task.
func (r *Repository) ListConnections(ctx context.Context) ([]*CalendarConnection, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, user_id, provider, email, access_token, refresh_token, expiry, google_calendar_id, sync_token, created_at, updated_at
		 FROM calendar_connections WHERE provider='google'`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*CalendarConnection
	for rows.Next() {
		conn := &CalendarConnection{}
		err := rows.Scan(&conn.ID, &conn.UserID, &conn.Provider, &conn.Email, &conn.AccessToken, &conn.RefreshToken, &conn.Expiry, &conn.GoogleCalendarID, &conn.SyncToken, &conn.CreatedAt, &conn.UpdatedAt)
		if err != nil {
			return nil, err
		}
		out = append(out, conn)
	}
	return out, rows.Err()
}

// DeleteConnection deletes a user's Google Calendar connection.
func (r *Repository) DeleteConnection(ctx context.Context, userID string) error {
	res, err := r.pool.Exec(ctx, `DELETE FROM calendar_connections WHERE user_id=$1 AND provider='google'`, userID)
	if err != nil {
		return err
	}
	if res.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// UpdateTaskExternalEventID writes the Google Calendar event ID back to the task.
// Does not touch updated_at so the pull-changes guard stays stable.
func (r *Repository) UpdateTaskExternalEventID(ctx context.Context, taskID string, eventID *string) error {
	_, err := r.pool.Exec(ctx, `UPDATE tasks SET external_event_id=$1 WHERE id=$2`, eventID, taskID)
	return err
}
