package auth

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	emailpkg "github.com/SachPlayZ/rivz-asn/backend/internal/email"
	"golang.org/x/crypto/bcrypt"
)

const (
	bcryptCost  = 12
	tokenExpiry = 72 * time.Hour
)

// Service handles business logic for user authentication.
type Service struct {
	repo        Repository
	jwtSecret   string
	emailClient *emailpkg.Client
	frontendURL string
}

// NewService creates a new auth Service.
func NewService(repo Repository, jwtSecret string, emailClient *emailpkg.Client, frontendURL string) *Service {
	return &Service{
		repo:        repo,
		jwtSecret:   jwtSecret,
		emailClient: emailClient,
		frontendURL: frontendURL,
	}
}

// Signup creates a new local user, sends a verification email, and returns no token.
// The user must verify their email before they can log in.
func (s *Service) Signup(ctx context.Context, email, password string) error {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcryptCost)
	if err != nil {
		return fmt.Errorf("auth: hash password: %w", err)
	}

	user, err := s.repo.CreateUser(ctx, email, string(hash))
	if err != nil {
		return err
	}

	token, err := s.repo.CreateVerificationToken(ctx, user.ID)
	if err != nil {
		return fmt.Errorf("auth: create verification token: %w", err)
	}

	if s.emailClient != nil {
		verifyURL := s.frontendURL + "/verify-email?token=" + token
		_ = s.emailClient.SendVerification(email, verifyURL)
	}

	return nil
}

// Login verifies credentials and returns a signed JWT and the user.
func (s *Service) Login(ctx context.Context, email, password string) (*LoginResult, error) {
	user, err := s.repo.GetUserByEmail(ctx, email)
	if err != nil {
		return nil, ErrInvalidCredentials
	}

	// OAuth-only accounts have no password hash.
	if user.passwordHash == nil {
		return nil, ErrOAuthAccount
	}

	if err := bcrypt.CompareHashAndPassword([]byte(*user.passwordHash), []byte(password)); err != nil {
		return nil, ErrInvalidCredentials
	}

	if !user.EmailVerified {
		return nil, ErrEmailNotVerified
	}

	tok, err := GenerateToken(user.ID, user.Role, s.jwtSecret, tokenExpiry)
	if err != nil {
		return nil, err
	}

	return &LoginResult{Token: tok, User: user}, nil
}

// VerifyEmail consumes the token, marks the user verified, and issues a JWT.
func (s *Service) VerifyEmail(ctx context.Context, token string) (*LoginResult, error) {
	userID, err := s.repo.ConsumeVerificationToken(ctx, token)
	if err != nil {
		return nil, err
	}

	if err := s.repo.MarkEmailVerified(ctx, userID); err != nil {
		return nil, fmt.Errorf("auth: mark verified: %w", err)
	}

	user, err := s.repo.GetUserByID(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("auth: get user after verify: %w", err)
	}

	tok, err := GenerateToken(user.ID, user.Role, s.jwtSecret, tokenExpiry)
	if err != nil {
		return nil, err
	}

	return &LoginResult{Token: tok, User: user}, nil
}

// ResendVerification deletes old tokens, creates a new one, and resends the email.
func (s *Service) ResendVerification(ctx context.Context, email string) error {
	user, err := s.repo.GetUserByEmail(ctx, email)
	if err != nil {
		// Don't reveal whether email exists.
		return nil
	}
	if user.EmailVerified {
		return nil
	}

	_ = s.repo.DeleteVerificationTokensForUser(ctx, user.ID)

	token, err := s.repo.CreateVerificationToken(ctx, user.ID)
	if err != nil {
		return fmt.Errorf("auth: create token: %w", err)
	}

	if s.emailClient != nil {
		verifyURL := s.frontendURL + "/verify-email?token=" + token
		return s.emailClient.SendVerification(email, verifyURL)
	}
	return nil
}

// IssueTokenForOAuthUser generates a JWT for a user obtained via OAuth.
func (s *Service) IssueTokenForOAuthUser(user *User) (string, error) {
	return GenerateToken(user.ID, user.Role, s.jwtSecret, tokenExpiry)
}

// LoginResult holds the token and user returned after a successful login.
type LoginResult struct {
	Token string
	User  *User
}

// GetUser returns the user with the given ID.
func (s *Service) GetUser(ctx context.Context, id string) (*User, error) {
	return s.repo.GetUserByID(ctx, id)
}

// Preferences holds the optional user preference fields a client may patch.
type Preferences struct {
	Theme         *string
	DigestEnabled *bool
	NotifPrefs    *json.RawMessage
	ChatURL       *string
	ChatKind      *string
}

// UpdatePreferences updates user preferences.
func (s *Service) UpdatePreferences(ctx context.Context, id string, prefs Preferences) error {
	return s.repo.UpdatePreferences(ctx, id, prefs)
}
