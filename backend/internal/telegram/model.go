// Package telegram implements the Fayde Telegram bot integration.
package telegram

import (
	"errors"
	"time"
)

// ErrNotFound is returned when no link exists for the given user or chat.
var ErrNotFound = errors.New("telegram: not found")

// TelegramLink represents a user's linked Telegram account.
type TelegramLink struct {
	UserID   string    `json:"user_id"`
	ChatID   int64     `json:"chat_id"`
	Username string    `json:"username"`
	LinkedAt time.Time `json:"linked_at"`
}

// LinkRequest is the body of POST /telegram/link.
type LinkRequest struct {
	// No fields needed from the frontend; the backend generates a code.
}

// LinkStatusResponse is returned by GET /telegram/link.
type LinkStatusResponse struct {
	Linked   bool   `json:"linked"`
	Username string `json:"username,omitempty"`
	BotURL   string `json:"bot_url,omitempty"`
	Code     string `json:"code,omitempty"`
}
