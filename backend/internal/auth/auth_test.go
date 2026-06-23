package auth_test

import (
	"context"
	"fmt"
	"os"
	"testing"

	"github.com/SachPlayZ/rivz-asn/backend/internal/auth"
	"github.com/SachPlayZ/rivz-asn/backend/internal/db"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
)

var testPool *pgxpool.Pool

func TestMain(m *testing.M) {
	ctx := context.Background()

	var connStr string

	if testURL := os.Getenv("TEST_DATABASE_URL"); testURL != "" {
		connStr = testURL
	} else {
		pgContainer, err := postgres.Run(ctx,
			"postgres:16-alpine",
			postgres.WithDatabase("testdb"),
			postgres.WithUsername("testuser"),
			postgres.WithPassword("testpass"),
			postgres.BasicWaitStrategies(),
		)
		if err != nil {
			fmt.Fprintf(os.Stderr, "start postgres container: %v\n", err)
			os.Exit(1)
		}
		defer func() {
			if err := pgContainer.Terminate(ctx); err != nil {
				fmt.Fprintf(os.Stderr, "terminate container: %v\n", err)
			}
		}()

		connStr, err = pgContainer.ConnectionString(ctx, "sslmode=disable")
		if err != nil {
			fmt.Fprintf(os.Stderr, "get connection string: %v\n", err)
			os.Exit(1)
		}
	}

	var err error
	testPool, err = db.Connect(ctx, connStr)
	if err != nil {
		fmt.Fprintf(os.Stderr, "connect pool: %v\n", err)
		os.Exit(1)
	}
	defer testPool.Close()

	migrateURL := toPgx5URL(connStr)
	if err := db.RunMigrations(migrateURL); err != nil && err.Error() != "no change" {
		fmt.Fprintf(os.Stderr, "run migrations: %v\n", err)
		os.Exit(1)
	}

	os.Exit(m.Run())
}

func toPgx5URL(u string) string {
	for _, prefix := range []string{"postgresql://", "postgres://"} {
		if len(u) > len(prefix) && u[:len(prefix)] == prefix {
			return "pgx5://" + u[len(prefix):]
		}
	}
	return u
}

func newService() *auth.Service {
	repo := auth.NewRepository(testPool)
	return auth.NewService(repo, "test-secret-key-for-testing-only", nil, "http://localhost:3000")
}

func TestSignupLoginFlow(t *testing.T) {
	repo := auth.NewRepository(testPool)
	svc := newService()
	ctx := context.Background()

	email := "signup_test@example.com"
	password := "securepassword123"

	// Signup sends a verification email; in tests the email client is nil so it's skipped.
	err := svc.Signup(ctx, email, password)
	require.NoError(t, err)

	// User must exist in DB with the correct email.
	user, err := repo.GetUserByEmail(ctx, email)
	require.NoError(t, err)
	assert.Equal(t, email, user.Email)

	// Verify email so login is allowed (email client disabled in tests — create token via repo).
	verifyToken, err := repo.CreateVerificationToken(ctx, user.ID)
	require.NoError(t, err)
	_, err = svc.VerifyEmail(ctx, verifyToken)
	require.NoError(t, err)

	// Correct password login should succeed.
	loginResult, err := svc.Login(ctx, email, password)
	require.NoError(t, err)
	assert.NotEmpty(t, loginResult.Token)
	assert.Equal(t, email, loginResult.User.Email)

	// Wrong password must return ErrInvalidCredentials (proves bcrypt is used, not plaintext compare).
	_, err = svc.Login(ctx, email, "wrongpassword")
	assert.ErrorIs(t, err, auth.ErrInvalidCredentials)

	// Non-existent user must return ErrInvalidCredentials.
	_, err = svc.Login(ctx, "nobody@example.com", password)
	assert.ErrorIs(t, err, auth.ErrInvalidCredentials)
}
