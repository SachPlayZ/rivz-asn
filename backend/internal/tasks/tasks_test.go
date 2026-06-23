package tasks_test

import (
	"context"
	"fmt"
	"os"
	"testing"

	"github.com/SachPlayZ/rivz-asn/backend/internal/activitylog"
	"github.com/SachPlayZ/rivz-asn/backend/internal/auth"
	"github.com/SachPlayZ/rivz-asn/backend/internal/db"
	"github.com/SachPlayZ/rivz-asn/backend/internal/sse"
	"github.com/SachPlayZ/rivz-asn/backend/internal/tasks"
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

// createTestUser registers a user and returns their ID.
// Email verification is skipped in tests (no email client configured).
func createTestUser(t *testing.T, email string) string {
	t.Helper()
	repo := auth.NewRepository(testPool)
	svc := auth.NewService(repo, "test-secret", nil, "")
	err := svc.Signup(context.Background(), email, "password123")
	require.NoError(t, err)
	user, err := repo.GetUserByEmail(context.Background(), email)
	require.NoError(t, err)
	return user.ID
}

func newTaskService() *tasks.Service {
	activityRepo := activitylog.NewRepository(testPool)
	activitySvc := activitylog.NewService(activityRepo)
	sseBroker := sse.NewBroker()
	return tasks.NewService(tasks.NewRepository(testPool), activitySvc, sseBroker)
}

// TestOwnership verifies that user B cannot access a task owned by user A.
func TestOwnership(t *testing.T) {
	ctx := context.Background()
	svc := newTaskService()

	userA := createTestUser(t, "owner_a@example.com")
	userB := createTestUser(t, "owner_b@example.com")

	task, err := svc.CreateTask(ctx, userA, tasks.CreateRequest{Title: "User A task"})
	require.NoError(t, err)

	// User B must not be able to fetch user A's task.
	_, err = svc.GetTask(ctx, task.ID, userB)
	assert.Error(t, err, "user B should get an error fetching user A's task")
}

// TestListFilter verifies status filtering returns only matching tasks.
func TestListFilter(t *testing.T) {
	ctx := context.Background()
	svc := newTaskService()

	userID := createTestUser(t, "filter_user@example.com")

	statusTodo := "todo"
	statusDone := "done"

	// Create two todo tasks and one done task.
	_, err := svc.CreateTask(ctx, userID, tasks.CreateRequest{Title: "Todo 1", Status: statusTodo})
	require.NoError(t, err)
	_, err = svc.CreateTask(ctx, userID, tasks.CreateRequest{Title: "Todo 2", Status: statusTodo})
	require.NoError(t, err)
	_, err = svc.CreateTask(ctx, userID, tasks.CreateRequest{Title: "Done 1", Status: statusDone})
	require.NoError(t, err)

	// Filter by "todo" status.
	result, err := svc.ListTasks(ctx, userID, tasks.ListParams{Status: "todo", Page: 1, Limit: 20})
	require.NoError(t, err)
	assert.Equal(t, 2, result.Total)
	for _, t2 := range result.Data {
		assert.Equal(t, "todo", t2.Status)
	}

	// Filter by "done" status.
	result, err = svc.ListTasks(ctx, userID, tasks.ListParams{Status: "done", Page: 1, Limit: 20})
	require.NoError(t, err)
	assert.Equal(t, 1, result.Total)
	assert.Equal(t, "done", result.Data[0].Status)
}

// TestValidation verifies that creating a task with an empty title returns an error.
func TestValidation(t *testing.T) {
	tests := []struct {
		name    string
		req     tasks.CreateRequest
		wantErr bool
	}{
		{
			name:    "valid task",
			req:     tasks.CreateRequest{Title: "Valid title"},
			wantErr: false,
		},
		{
			name:    "empty title",
			req:     tasks.CreateRequest{Title: ""},
			wantErr: true,
		},
		{
			name:    "whitespace title stored but repo accepts it",
			req:     tasks.CreateRequest{Title: " "},
			wantErr: false, // DB does not reject whitespace; handler-level validation does
		},
	}

	ctx := context.Background()
	svc := newTaskService()
	userID := createTestUser(t, "validation_user@example.com")

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			_, err := svc.CreateTask(ctx, userID, tc.req)
			if tc.wantErr {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
			}
		})
	}
}
