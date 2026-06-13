package attachments_test

import (
	"context"
	"fmt"
	"io"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/SachPlayZ/rivz-asn/backend/internal/activitylog"
	"github.com/SachPlayZ/rivz-asn/backend/internal/attachments"
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

// stubStorage is an in-memory Storage implementation for tests.
type stubStorage struct {
	mu      sync.Mutex
	objects map[string][]byte
}

func newStubStorage() *stubStorage {
	return &stubStorage{objects: make(map[string][]byte)}
}

func (s *stubStorage) Upload(_ context.Context, key, _ string, body io.Reader, _ int64) error {
	data, err := io.ReadAll(body)
	if err != nil {
		return err
	}
	s.mu.Lock()
	s.objects[key] = data
	s.mu.Unlock()
	return nil
}

func (s *stubStorage) Delete(_ context.Context, key string) error {
	s.mu.Lock()
	delete(s.objects, key)
	s.mu.Unlock()
	return nil
}

func (s *stubStorage) PresignURL(_ context.Context, key string, _ time.Duration) (string, error) {
	return "https://stub.s3.example.com/" + key + "?presigned=1", nil
}

func (s *stubStorage) has(key string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	_, ok := s.objects[key]
	return ok
}

func (s *stubStorage) len() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return len(s.objects)
}

// createTestUser registers a new user and returns their ID.
func createTestUser(t *testing.T, email string) string {
	t.Helper()
	repo := auth.NewRepository(testPool)
	svc := auth.NewService(repo, "test-secret")
	result, err := svc.Signup(context.Background(), email, "password123")
	require.NoError(t, err)
	return result.User.ID
}

// createTestTask creates a task owned by userID and returns its ID.
func createTestTask(t *testing.T, userID string) string {
	t.Helper()
	activityRepo := activitylog.NewRepository(testPool)
	activitySvc := activitylog.NewService(activityRepo)
	sseBroker := sse.NewBroker()
	svc := tasks.NewService(tasks.NewRepository(testPool), activitySvc, sseBroker)
	task, err := svc.CreateTask(context.Background(), userID, tasks.CreateRequest{Title: "test task"})
	require.NoError(t, err)
	return task.ID
}

// newAttachmentService creates an attachments Service backed by the test pool and stub storage.
func newAttachmentService(store *stubStorage) *attachments.Service {
	return attachments.NewService(attachments.NewRepository(testPool), store)
}

func TestUploadStoresObjectAndReturnsPresignedURL(t *testing.T) {
	ctx := context.Background()
	store := newStubStorage()
	svc := newAttachmentService(store)

	userID := createTestUser(t, "upload_test@example.com")
	taskID := createTestTask(t, userID)

	content := "hello attachment"
	body := strings.NewReader(content)

	att, err := svc.Upload(ctx, taskID, userID, "hello.txt", "text/plain", body, int64(len(content)))
	require.NoError(t, err)

	assert.NotEmpty(t, att.ID)
	assert.Equal(t, taskID, att.TaskID)
	assert.Equal(t, userID, att.UserID)
	assert.Equal(t, "hello.txt", att.Filename)
	assert.Equal(t, "text/plain", att.ContentType)
	assert.Equal(t, int64(len(content)), att.SizeBytes)
	assert.Contains(t, att.URL, "presigned=1", "URL should be a pre-signed URL")
	assert.Empty(t, att.S3Key, "S3 key must not be exposed")

	assert.Equal(t, 1, store.len(), "object should exist in stub storage")
}

func TestListReturnsUploadedAttachments(t *testing.T) {
	ctx := context.Background()
	store := newStubStorage()
	svc := newAttachmentService(store)

	userID := createTestUser(t, "list_test@example.com")
	taskID := createTestTask(t, userID)

	for i := range 3 {
		body := strings.NewReader(fmt.Sprintf("file%d", i))
		_, err := svc.Upload(ctx, taskID, userID, fmt.Sprintf("file%d.txt", i), "text/plain", body, int64(len(fmt.Sprintf("file%d", i))))
		require.NoError(t, err)
	}

	list, err := svc.List(ctx, taskID, userID)
	require.NoError(t, err)

	assert.Len(t, list, 3)
	for _, att := range list {
		assert.Contains(t, att.URL, "presigned=1")
		assert.Empty(t, att.S3Key)
	}
}

func TestListIsolatedByUser(t *testing.T) {
	ctx := context.Background()
	store := newStubStorage()
	svc := newAttachmentService(store)

	userA := createTestUser(t, "iso_user_a@example.com")
	userB := createTestUser(t, "iso_user_b@example.com")
	taskA := createTestTask(t, userA)

	body := strings.NewReader("data")
	_, err := svc.Upload(ctx, taskA, userA, "a.txt", "text/plain", body, 4)
	require.NoError(t, err)

	// User B must not see user A's attachments.
	list, err := svc.List(ctx, taskA, userB)
	require.NoError(t, err)
	assert.Empty(t, list)
}

func TestDeleteRemovesAttachmentAndS3Object(t *testing.T) {
	ctx := context.Background()
	store := newStubStorage()
	svc := newAttachmentService(store)

	userID := createTestUser(t, "delete_test@example.com")
	taskID := createTestTask(t, userID)

	body := strings.NewReader("to delete")
	att, err := svc.Upload(ctx, taskID, userID, "del.txt", "text/plain", body, 9)
	require.NoError(t, err)
	assert.Equal(t, 1, store.len())

	err = svc.Delete(ctx, att.ID, taskID, userID)
	require.NoError(t, err)

	assert.Equal(t, 0, store.len(), "object should be removed from stub storage")

	list, err := svc.List(ctx, taskID, userID)
	require.NoError(t, err)
	assert.Empty(t, list)
}

func TestDeleteRejectsWrongUser(t *testing.T) {
	ctx := context.Background()
	store := newStubStorage()
	svc := newAttachmentService(store)

	userA := createTestUser(t, "del_owner@example.com")
	userB := createTestUser(t, "del_thief@example.com")
	taskID := createTestTask(t, userA)

	body := strings.NewReader("protected")
	att, err := svc.Upload(ctx, taskID, userA, "secret.txt", "text/plain", body, 9)
	require.NoError(t, err)

	err = svc.Delete(ctx, att.ID, taskID, userB)
	assert.Error(t, err, "user B should not be able to delete user A's attachment")
	assert.Equal(t, 1, store.len(), "object should still be in storage")
}
