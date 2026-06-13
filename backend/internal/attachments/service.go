package attachments

import (
	"context"
	"fmt"
	"io"
	"time"

	"github.com/google/uuid"
)

const presignExpiry = time.Hour

// Service handles business logic for task attachments.
type Service struct {
	repo     Repository
	s3Client Storage
}

// NewService creates a new attachments Service.
func NewService(repo Repository, s3Client Storage) *Service {
	return &Service{repo: repo, s3Client: s3Client}
}

// Upload stores a file in S3 and records it in the database.
// The S3 key is generated as tasks/{taskID}/{uuid}-{filename}.
func (s *Service) Upload(ctx context.Context, taskID, userID, filename, contentType string, body io.Reader, size int64) (*Attachment, error) {
	key := fmt.Sprintf("tasks/%s/%s-%s", taskID, uuid.New().String(), filename)

	if err := s.s3Client.Upload(ctx, key, contentType, body, size); err != nil {
		return nil, fmt.Errorf("attachments: upload to s3: %w", err)
	}

	att, err := s.repo.Insert(ctx, taskID, userID, key, filename, contentType, size)
	if err != nil {
		// Best-effort S3 cleanup on DB failure.
		_ = s.s3Client.Delete(ctx, key)
		return nil, fmt.Errorf("attachments: save record: %w", err)
	}

	url, err := s.s3Client.PresignURL(ctx, key, presignExpiry)
	if err != nil {
		return nil, fmt.Errorf("attachments: presign after upload: %w", err)
	}
	att.URL = url
	att.S3Key = "" // don't expose internal key

	return att, nil
}

// List returns all attachments for a task, each with a fresh pre-signed URL.
func (s *Service) List(ctx context.Context, taskID, userID string) ([]*Attachment, error) {
	list, err := s.repo.ListByTask(ctx, taskID, userID)
	if err != nil {
		return nil, fmt.Errorf("attachments: list: %w", err)
	}

	for _, att := range list {
		url, presignErr := s.s3Client.PresignURL(ctx, att.S3Key, presignExpiry)
		if presignErr == nil {
			att.URL = url
		}
		att.S3Key = "" // don't expose internal key
	}

	return list, nil
}

// Delete removes an attachment from the database and S3.
func (s *Service) Delete(ctx context.Context, id, taskID, userID string) error {
	s3Key, err := s.repo.Delete(ctx, id, taskID, userID)
	if err != nil {
		return fmt.Errorf("attachments: delete record: %w", err)
	}

	if delErr := s.s3Client.Delete(ctx, s3Key); delErr != nil {
		// Log-worthy but not fatal — record is already gone from DB.
		return fmt.Errorf("attachments: delete from s3: %w", delErr)
	}

	return nil
}
