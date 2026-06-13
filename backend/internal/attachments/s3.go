package attachments

import (
	"context"
	"fmt"
	"io"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

// Storage is the interface the Service uses for object storage operations.
type Storage interface {
	Upload(ctx context.Context, key, contentType string, body io.Reader, size int64) error
	Delete(ctx context.Context, key string) error
	PresignURL(ctx context.Context, key string, expiry time.Duration) (string, error)
}

// S3Client wraps the AWS S3 client with convenience methods.
type S3Client struct {
	client *s3.Client
	bucket string
}

// NewS3Client creates a new S3Client using explicit credentials.
func NewS3Client(ctx context.Context, region, accessKeyID, secretAccessKey, bucket string) (*S3Client, error) {
	cfg, err := awsconfig.LoadDefaultConfig(ctx,
		awsconfig.WithRegion(region),
		awsconfig.WithCredentialsProvider(
			credentials.NewStaticCredentialsProvider(accessKeyID, secretAccessKey, ""),
		),
	)
	if err != nil {
		return nil, fmt.Errorf("attachments: load aws config: %w", err)
	}

	return &S3Client{
		client: s3.NewFromConfig(cfg),
		bucket: bucket,
	}, nil
}

// Upload streams body to S3 under the given key.
func (c *S3Client) Upload(ctx context.Context, key, contentType string, body io.Reader, size int64) error {
	_, err := c.client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:        aws.String(c.bucket),
		Key:           aws.String(key),
		Body:          body,
		ContentType:   aws.String(contentType),
		ContentLength: aws.Int64(size),
	})
	if err != nil {
		return fmt.Errorf("attachments: s3 upload: %w", err)
	}
	return nil
}

// Delete removes an object from S3.
func (c *S3Client) Delete(ctx context.Context, key string) error {
	_, err := c.client.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: aws.String(c.bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		return fmt.Errorf("attachments: s3 delete: %w", err)
	}
	return nil
}

// PresignURL generates a pre-signed GET URL for the given key.
func (c *S3Client) PresignURL(ctx context.Context, key string, expiry time.Duration) (string, error) {
	presignClient := s3.NewPresignClient(c.client)
	req, err := presignClient.PresignGetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(c.bucket),
		Key:    aws.String(key),
	}, s3.WithPresignExpires(expiry))
	if err != nil {
		return "", fmt.Errorf("attachments: presign url: %w", err)
	}
	return req.URL, nil
}
