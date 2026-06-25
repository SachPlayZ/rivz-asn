package notifications

import (
	"bytes"
	"context"
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/SachPlayZ/rivz-asn/backend/internal/webpush"
)

// EmailSender delivers a notification by email (implemented by email.Client).
type EmailSender interface {
	SendNotification(to, title, body, url string) error
}

// PushSender delivers a notification via web push (implemented by webpush.Service).
type PushSender interface {
	SendToUser(ctx context.Context, userID string, p webpush.Payload)
}

// DeliveryPrefs is a user's per-channel notification configuration.
type DeliveryPrefs struct {
	InApp    bool   `json:"in_app"`
	Email    bool   `json:"email"`
	WebPush  bool   `json:"web_push"`
	Chat     bool   `json:"chat"`
	UserMail string `json:"-"`
	ChatURL  string `json:"-"`
	ChatKind string `json:"-"`
}

// SetDeliverers wires the out-of-band delivery channels. Called once at startup.
// Any nil sender disables that channel.
func (s *Service) SetDeliverers(email EmailSender, push PushSender, frontendURL string) {
	s.email = email
	s.push = push
	s.frontendURL = frontendURL
}

// deliver fans a notification out to email / web push / chat per the user's prefs.
// In-app (SSE) is handled by Create itself. Runs in its own goroutine.
func (s *Service) deliver(n *Notification) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	prefs, err := s.repo.DeliveryTargets(ctx, n.UserID)
	if err != nil {
		log.Printf("notifications: delivery targets: %v", err)
		return
	}

	url := ""
	if n.TaskID != nil && s.frontendURL != "" {
		url = s.frontendURL + "/tasks/" + *n.TaskID
	}

	if prefs.Email && s.email != nil && prefs.UserMail != "" {
		if err := s.email.SendNotification(prefs.UserMail, titleFor(n.Type), n.Message, url); err != nil {
			log.Printf("notifications: email deliver notif=%s type=%s user=%s: %v", n.ID, n.Type, n.UserID, err)
		}
	}

	if prefs.WebPush && s.push != nil {
		s.push.SendToUser(ctx, n.UserID, webpush.Payload{
			Title: titleFor(n.Type),
			Body:  n.Message,
			URL:   url,
			Tag:   n.Type,
		})
	}

	if prefs.Chat && prefs.ChatURL != "" {
		sendChat(prefs.ChatKind, prefs.ChatURL, titleFor(n.Type), n.Message)
	}
}

// titleFor turns a notification type into a human title.
func titleFor(nType string) string {
	switch nType {
	case "mention":
		return "You were mentioned"
	case "due_reminder":
		return "Task due soon"
	case "dependency_unblocked":
		return "Task unblocked"
	case "assigned":
		return "Task assigned to you"
	case "reminder":
		return "Reminder"
	case "automation":
		return "Automation Triggered"
	default:
		return "Notification"
	}
}

// sendChat posts to a Slack or Discord incoming webhook.
func sendChat(kind, url, title, body string) {
	var payload map[string]any
	switch kind {
	case "discord":
		payload = map[string]any{"content": "**" + title + "**\n" + body}
	default: // slack
		payload = map[string]any{"text": "*" + title + "*\n" + body}
	}
	raw, _ := json.Marshal(payload)
	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(raw))
	if err != nil {
		return
	}
	req.Header.Set("Content-Type", "application/json")
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		log.Printf("notifications: chat deliver: %v", err)
		return
	}
	resp.Body.Close()
}
