// Package activitylog records task lifecycle events for audit purposes.
package activitylog

import (
	"encoding/json"
	"time"
)

// ActivityLog represents a single recorded event on a task.
type ActivityLog struct {
	ID        string          `json:"id"`
	TaskID    string          `json:"task_id"`
	UserID    string          `json:"user_id"`
	Action    string          `json:"action"`
	Changes   json.RawMessage `json:"changes"`
	CreatedAt time.Time       `json:"created_at"`
}

// ActivityLogWithTask embeds ActivityLog with the task title for display in global feeds.
type ActivityLogWithTask struct {
	ActivityLog
	TaskTitle string `json:"task_title"`
}
