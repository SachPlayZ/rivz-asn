package auth

import (
	"context"
	"fmt"
	"time"

	"golang.org/x/crypto/bcrypt"
)

const (
	bcryptCost    = 12
	tokenExpiry   = 72 * time.Hour
)

// Service handles business logic for user authentication.
type Service struct {
	repo      Repository
	jwtSecret string
}

// NewService creates a new auth Service.
func NewService(repo Repository, jwtSecret string) *Service {
	return &Service{repo: repo, jwtSecret: jwtSecret}
}

// SignupResult holds the token and user returned after a successful signup.
type SignupResult struct {
	Token string
	User  *User
}

// Signup creates a new user account and returns a signed JWT and the new user.
// Returns an error wrapping the repository error on duplicate email.
func (s *Service) Signup(ctx context.Context, email, password string) (*SignupResult, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcryptCost)
	if err != nil {
		return nil, fmt.Errorf("auth: hash password: %w", err)
	}

	user, err := s.repo.CreateUser(ctx, email, string(hash))
	if err != nil {
		return nil, err
	}

	token, err := GenerateToken(user.ID, s.jwtSecret, tokenExpiry)
	if err != nil {
		return nil, err
	}

	return &SignupResult{Token: token, User: user}, nil
}

// LoginResult holds the token and user returned after a successful login.
type LoginResult struct {
	Token string
	User  *User
}

// Login verifies credentials and returns a signed JWT and the user.
// Returns ErrInvalidCredentials if the email is not found or the password is wrong.
func (s *Service) Login(ctx context.Context, email, password string) (*LoginResult, error) {
	user, err := s.repo.GetUserByEmail(ctx, email)
	if err != nil {
		return nil, ErrInvalidCredentials
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)); err != nil {
		return nil, ErrInvalidCredentials
	}

	token, err := GenerateToken(user.ID, s.jwtSecret, tokenExpiry)
	if err != nil {
		return nil, err
	}

	return &LoginResult{Token: token, User: user}, nil
}

// GetUser returns the user with the given ID.
func (s *Service) GetUser(ctx context.Context, id string) (*User, error) {
	return s.repo.GetUserByID(ctx, id)
}
