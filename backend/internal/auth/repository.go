package auth

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Repository defines persistence operations for users.
type Repository interface {
	CreateUser(ctx context.Context, email, passwordHash string) (*User, error)
	GetUserByEmail(ctx context.Context, email string) (*User, error)
	GetUserByID(ctx context.Context, id string) (*User, error)
}

type pgRepository struct {
	pool *pgxpool.Pool
}

// NewRepository returns a Postgres-backed Repository.
func NewRepository(pool *pgxpool.Pool) Repository {
	return &pgRepository{pool: pool}
}

// CreateUser inserts a new user and returns the created record.
func (r *pgRepository) CreateUser(ctx context.Context, email, passwordHash string) (*User, error) {
	const q = `
		INSERT INTO users (email, password_hash)
		VALUES ($1, $2)
		RETURNING id, email, password_hash, created_at`

	u := &User{}
	err := r.pool.QueryRow(ctx, q, email, passwordHash).
		Scan(&u.ID, &u.Email, &u.PasswordHash, &u.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("auth: create user: %w", err)
	}

	return u, nil
}

// GetUserByEmail fetches a user by email address.
func (r *pgRepository) GetUserByEmail(ctx context.Context, email string) (*User, error) {
	const q = `SELECT id, email, password_hash, created_at FROM users WHERE email = $1`

	u := &User{}
	err := r.pool.QueryRow(ctx, q, email).
		Scan(&u.ID, &u.Email, &u.PasswordHash, &u.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("auth: get user by email: %w", err)
	}

	return u, nil
}

// GetUserByID fetches a user by primary key.
func (r *pgRepository) GetUserByID(ctx context.Context, id string) (*User, error) {
	const q = `SELECT id, email, password_hash, created_at FROM users WHERE id = $1`

	u := &User{}
	err := r.pool.QueryRow(ctx, q, id).
		Scan(&u.ID, &u.Email, &u.PasswordHash, &u.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("auth: get user by id: %w", err)
	}

	return u, nil
}
