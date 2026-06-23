package automations

import (
	"bytes"
	"context"
	"encoding/json"
	"log"
	"net/http"
	"time"
)

// Notifier lets automations create in-app/multi-channel notifications.
type Notifier interface {
	Create(ctx context.Context, userID, nType string, taskID *string, message string)
}

type Service struct {
	repo  *Repository
	notif Notifier
}

func NewService(repo *Repository, notif Notifier) *Service {
	return &Service{repo: repo, notif: notif}
}

func (s *Service) List(ctx context.Context, userID string) ([]*Automation, error) {
	return s.repo.List(ctx, userID)
}
func (s *Service) Create(ctx context.Context, userID string, req CreateRequest) (*Automation, error) {
	return s.repo.Create(ctx, userID, req)
}
func (s *Service) Update(ctx context.Context, id, userID string, req UpdateRequest) (*Automation, error) {
	return s.repo.Update(ctx, id, userID, req)
}
func (s *Service) Delete(ctx context.Context, id, userID string) error {
	return s.repo.Delete(ctx, id, userID)
}

// OnTaskEvent implements the tasks.AutomationEngine interface. Runs async-safe.
// status/priority are the task's values after the change.
func (s *Service) OnTaskEvent(ctx context.Context, userID, taskID, event, title, status, priority string) {
	defer func() {
		if r := recover(); r != nil {
			log.Printf("automations: panic in OnTaskEvent: %v", r)
		}
	}()

	rules, err := s.repo.ListEnabled(ctx, userID)
	if err != nil {
		log.Printf("automations: list enabled: %v", err)
		return
	}
	log.Printf("automations: event=%s status=%s rules=%d taskID=%s", event, status, len(rules), taskID)
	for _, rule := range rules {
		matched := triggerMatches(rule.Trigger, event, status) && conditionsMatch(rule.Conditions, status, priority)
		log.Printf("automations: rule=%s trigger=%+v matched=%v", rule.Name, rule.Trigger, matched)
		if !matched {
			continue
		}
		s.runActions(ctx, userID, taskID, title, rule.Actions)
	}
}

func triggerMatches(t Trigger, event, status string) bool {
	switch t.Event {
	case "created":
		return event == "created"
	case "updated":
		return event == "updated" || event == "status_changed"
	case "status_changed":
		if event != "status_changed" {
			return false
		}
		return t.To == "" || t.To == status
	}
	return false
}

func conditionsMatch(conds []Condition, status, priority string) bool {
	for _, c := range conds {
		var actual string
		switch c.Field {
		case "status":
			actual = status
		case "priority":
			actual = priority
		default:
			continue
		}
		switch c.Op {
		case "eq":
			if actual != c.Value {
				return false
			}
		case "neq":
			if actual == c.Value {
				return false
			}
		}
	}
	return true
}

func (s *Service) runActions(ctx context.Context, userID, taskID, title string, actions []Action) {
	for _, a := range actions {
		switch a.Type {
		case "set_status":
			if err := s.repo.SetTaskStatus(ctx, taskID, userID, a.Value); err != nil {
				log.Printf("automations: set_status: %v", err)
			}
		case "set_priority":
			if err := s.repo.SetTaskPriority(ctx, taskID, userID, a.Value); err != nil {
				log.Printf("automations: set_priority: %v", err)
			}
		case "notify":
			if s.notif != nil {
				msg := a.Value
				if msg == "" {
					msg = "Automation triggered for: " + title
				}
				tid := taskID
				log.Printf("automations: creating notification for user=%s task=%s msg=%q", userID, taskID, msg)
				s.notif.Create(ctx, userID, "automation", &tid, msg)
			} else {
				log.Printf("automations: notifier is nil, skipping notify action")
			}
		case "webhook":
			sendWebhook(a.Kind, a.Value, title)
		}
	}
}

func sendWebhook(kind, url, title string) {
	if url == "" {
		return
	}
	var payload map[string]any
	text := "Automation: " + title
	switch kind {
	case "discord":
		payload = map[string]any{"content": text}
	default:
		payload = map[string]any{"text": text}
	}
	raw, _ := json.Marshal(payload)
	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(raw))
	if err != nil {
		return
	}
	req.Header.Set("Content-Type", "application/json")
	client := &http.Client{Timeout: 10 * time.Second}
	if resp, err := client.Do(req); err == nil {
		resp.Body.Close()
	}
}
