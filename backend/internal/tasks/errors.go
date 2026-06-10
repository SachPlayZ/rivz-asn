package tasks

import "errors"

// ErrNotFound is returned when a task does not exist or is not owned by the user.
var ErrNotFound = errors.New("tasks: not found")
