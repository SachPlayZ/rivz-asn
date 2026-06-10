package auth

import "errors"

// ErrInvalidCredentials is returned when login credentials do not match.
var ErrInvalidCredentials = errors.New("auth: invalid email or password")

// ErrDuplicateEmail is returned when a user tries to register with an email already in use.
var ErrDuplicateEmail = errors.New("auth: email already registered")
