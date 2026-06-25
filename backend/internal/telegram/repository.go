package telegram

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Repository provides persistence for Telegram links.
type Repository interface {
	LinkUser(ctx context.Context, userID string, chatID int64, username string) error
	UserIDByChat(ctx context.Context, chatID int64) (string, error)
	UnlinkUser(ctx context.Context, userID string) error
	GetLink(ctx context.Context, userID string) (*TelegramLink, error)
}

type pgRepository struct{ pool *pgxpool.Pool }

// NewRepository returns a Postgres-backed Repository.
func NewRepository(pool *pgxpool.Pool) Repository {
	return &pgRepository{pool: pool}
}

func (r *pgRepository) LinkUser(ctx context.Context, userID string, chatID int64, username string) error {
	const q = `INSERT INTO telegram_links (user_id, chat_id, username)
		VALUES ($1, $2, $3)
		ON CONFLICT (user_id) DO UPDATE SET chat_id = $2, username = $3, linked_at = now()`
	_, err := r.pool.Exec(ctx, q, userID, chatID, username)
	if err != nil {
		return fmt.Errorf("telegram.LinkUser: %w", err)
	}
	return nil
}

func (r *pgRepository) UserIDByChat(ctx context.Context, chatID int64) (string, error) {
	var userID string
	err := r.pool.QueryRow(ctx, `SELECT user_id FROM telegram_links WHERE chat_id = $1`, chatID).Scan(&userID)
	if err == pgx.ErrNoRows {
		return "", ErrNotFound
	}
	if err != nil {
		return "", fmt.Errorf("telegram.UserIDByChat: %w", err)
	}
	return userID, nil
}

func (r *pgRepository) UnlinkUser(ctx context.Context, userID string) error {
	tag, err := r.pool.Exec(ctx, `DELETE FROM telegram_links WHERE user_id = $1`, userID)
	if err != nil {
		return fmt.Errorf("telegram.UnlinkUser: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *pgRepository) GetLink(ctx context.Context, userID string) (*TelegramLink, error) {
	var l TelegramLink
	err := r.pool.QueryRow(ctx,
		`SELECT user_id, chat_id, username, linked_at FROM telegram_links WHERE user_id = $1`,
		userID,
	).Scan(&l.UserID, &l.ChatID, &l.Username, &l.LinkedAt)
	if err == pgx.ErrNoRows {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("telegram.GetLink: %w", err)
	}
	return &l, nil
}
