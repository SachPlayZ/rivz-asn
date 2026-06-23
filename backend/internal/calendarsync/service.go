package calendarsync

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/SachPlayZ/rivz-asn/backend/internal/tasks"
	"github.com/jackc/pgx/v5"
	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
)

// Service implements Google Calendar integration.
type Service struct {
	repo         *Repository
	tasksRepo    tasks.Repository
	googleConfig *oauth2.Config
	frontendURL  string
	jwtSecret    string
	tokenMu      sync.Map // map[userID]*sync.Mutex — serialises per-user token refresh
}

// NewService creates a new calendarsync Service.
func NewService(
	repo *Repository,
	tasksRepo tasks.Repository,
	googleClientID, googleClientSecret,
	appURL, frontendURL, jwtSecret string,
) *Service {
	cfg := &oauth2.Config{
		ClientID:     googleClientID,
		ClientSecret: googleClientSecret,
		RedirectURL:  appURL + "/calendar/callback",
		Scopes: []string{
			"https://www.googleapis.com/auth/calendar.events",
			"https://www.googleapis.com/auth/userinfo.email",
		},
		Endpoint: google.Endpoint,
	}

	return &Service{
		repo:         repo,
		tasksRepo:    tasksRepo,
		googleConfig: cfg,
		frontendURL:  frontendURL,
		jwtSecret:    jwtSecret,
	}
}

func (s *Service) userMu(userID string) *sync.Mutex {
	v, _ := s.tokenMu.LoadOrStore(userID, &sync.Mutex{})
	return v.(*sync.Mutex)
}

// GetStatus checks if the user is connected to Google Calendar.
func (s *Service) GetStatus(ctx context.Context, userID string) (*ConnectionStatus, error) {
	conn, err := s.repo.GetConnection(ctx, userID)
	if errors.Is(err, ErrNotFound) {
		return &ConnectionStatus{Connected: false}, nil
	}
	if err != nil {
		return nil, err
	}
	return &ConnectionStatus{
		Connected: true,
		Email:     conn.Email,
	}, nil
}

// Disconnect removes the Google Calendar connection.
func (s *Service) Disconnect(ctx context.Context, userID string) error {
	return s.repo.DeleteConnection(ctx, userID)
}

// ListConnections fetches all connections (used by scheduler).
func (s *Service) ListConnections(ctx context.Context) ([]*CalendarConnection, error) {
	return s.repo.ListConnections(ctx)
}

// Connect exchanges code for a token, creates a custom calendar, and saves connection atomically.
func (s *Service) Connect(ctx context.Context, userID, authCode string) error {
	tok, err := s.googleConfig.Exchange(ctx, authCode)
	if err != nil {
		return fmt.Errorf("exchange code: %w", err)
	}

	email, err := s.fetchGoogleEmail(ctx, tok.AccessToken)
	if err != nil {
		return fmt.Errorf("fetch google email: %w", err)
	}

	client := oauth2.NewClient(ctx, s.googleConfig.TokenSource(ctx, tok))
	calendarID, err := s.createCustomCalendar(ctx, client)
	if err != nil {
		return fmt.Errorf("create custom calendar: %w", err)
	}

	return s.repo.ConnectTx(ctx, userID, email, tok.AccessToken, tok.RefreshToken, tok.Expiry, calendarID)
}

func (s *Service) fetchGoogleEmail(ctx context.Context, accessToken string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://www.googleapis.com/oauth2/v2/userinfo", nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("google userinfo returned status %d", resp.StatusCode)
	}

	var res struct {
		Email string `json:"email"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&res); err != nil {
		return "", err
	}
	return res.Email, nil
}

func (s *Service) createCustomCalendar(ctx context.Context, client *http.Client) (string, error) {
	body := map[string]string{"summary": "Fayde Tasks"}
	bodyBytes, _ := json.Marshal(body)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://www.googleapis.com/calendar/v3/calendars", bytes.NewReader(bodyBytes))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("create calendar failed %d: %s", resp.StatusCode, string(respBody))
	}

	var res struct {
		ID string `json:"id"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&res); err != nil {
		return "", err
	}
	return res.ID, nil
}

// Structs for Google Calendar API
type eventDateTime struct {
	DateTime string `json:"dateTime"`
	TimeZone string `json:"timeZone,omitempty"`
}

type googleEvent struct {
	ID          string        `json:"id,omitempty"`
	Summary     string        `json:"summary"`
	Description string        `json:"description"`
	Start       eventDateTime `json:"start"`
	End         eventDateTime `json:"end"`
	Updated     string        `json:"updated,omitempty"`
	Status      string        `json:"status,omitempty"`
}

// SyncTask pushes a task to Google Calendar.
func (s *Service) SyncTask(ctx context.Context, task *tasks.Task) error {
	conn, err := s.repo.GetConnection(ctx, task.UserID)
	if errors.Is(err, ErrNotFound) {
		return nil // Not connected, ignore silently
	}
	if err != nil {
		return err
	}

	calendarID := "primary"
	if conn.GoogleCalendarID != nil && *conn.GoogleCalendarID != "" {
		calendarID = *conn.GoogleCalendarID
	}

	mu := s.userMu(task.UserID)
	mu.Lock()
	ts := s.googleConfig.TokenSource(ctx, &oauth2.Token{
		AccessToken:  conn.AccessToken,
		RefreshToken: conn.RefreshToken,
		Expiry:       conn.Expiry,
	})
	refreshed, err := ts.Token()
	if err != nil {
		mu.Unlock()
		return fmt.Errorf("get token: %w", err)
	}
	if refreshed.AccessToken != conn.AccessToken {
		_ = s.repo.UpdateAccessToken(ctx, task.UserID, refreshed.AccessToken, refreshed.Expiry)
	}
	mu.Unlock()

	client := oauth2.NewClient(ctx, ts)

	// Case 1: No due date — delete the event if one exists
	if task.DueDate == nil {
		if task.ParentTaskID != nil {
			return nil
		}
		extEventID := task.ExternalEventID
		if extEventID != nil && *extEventID != "" {
			if err := s.deleteEvent(ctx, client, calendarID, *extEventID); err != nil {
				log.Printf("calendarsync: delete event %s error: %v", *extEventID, err)
			}
			_ = s.repo.UpdateTaskExternalEventID(ctx, task.ID, nil)
		}
		return nil
	}

	// Case 2: Has due date -> Sync event
	extEventID := task.ExternalEventID

	title := task.Title
	if task.Status == "done" || task.Status == "failed" {
		title = fmt.Sprintf("[%s] %s", strings.ToUpper(task.Status[:1])+task.Status[1:], task.Title)
	}

	desc := task.Description
	if s.frontendURL != "" {
		desc = fmt.Sprintf("%s\n\nLink to task: %s/tasks/%s", desc, s.frontendURL, task.ID)
	}

	startTime := task.DueDate.UTC().Format(time.RFC3339)
	endTime := task.DueDate.UTC().Add(30 * time.Minute).Format(time.RFC3339)

	eventData := googleEvent{
		Summary:     title,
		Description: desc,
		Start:       eventDateTime{DateTime: startTime},
		End:         eventDateTime{DateTime: endTime},
	}

	bodyBytes, _ := json.Marshal(eventData)

	if extEventID != nil && *extEventID != "" {
		// Update existing event
		url := fmt.Sprintf("https://www.googleapis.com/calendar/v3/calendars/%s/events/%s", calendarID, *extEventID)
		req, _ := http.NewRequestWithContext(ctx, http.MethodPut, url, bytes.NewReader(bodyBytes))
		req.Header.Set("Content-Type", "application/json")

		resp, err := client.Do(req)
		if err != nil {
			return err
		}
		defer resp.Body.Close()

		if resp.StatusCode == http.StatusNotFound {
			*extEventID = ""
		} else if resp.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(resp.Body)
			return fmt.Errorf("google calendar returned status %d: %s", resp.StatusCode, string(body))
		}
	}

	if extEventID == nil || *extEventID == "" {
		// Create new event
		url := fmt.Sprintf("https://www.googleapis.com/calendar/v3/calendars/%s/events", calendarID)
		req, _ := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(bodyBytes))
		req.Header.Set("Content-Type", "application/json")

		resp, err := client.Do(req)
		if err != nil {
			return err
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(resp.Body)
			return fmt.Errorf("google calendar returned status %d: %s", resp.StatusCode, string(body))
		}

		var created googleEvent
		if err := json.NewDecoder(resp.Body).Decode(&created); err != nil {
			return err
		}

		_ = s.repo.UpdateTaskExternalEventID(ctx, task.ID, &created.ID)
	}

	return nil
}

// PullChanges fetches calendar events from Google and updates tasks in DB.
func (s *Service) PullChanges(ctx context.Context, userID string) error {
	return s.pullChanges(ctx, userID, false)
}

func (s *Service) pullChanges(ctx context.Context, userID string, retried bool) error {
	conn, err := s.repo.GetConnection(ctx, userID)
	if err != nil {
		return err
	}
	if conn.GoogleCalendarID == nil || *conn.GoogleCalendarID == "" {
		return nil // Not initialized with a custom calendar, bypass
	}
	calendarID := *conn.GoogleCalendarID

	mu := s.userMu(userID)
	mu.Lock()
	ts := s.googleConfig.TokenSource(ctx, &oauth2.Token{
		AccessToken:  conn.AccessToken,
		RefreshToken: conn.RefreshToken,
		Expiry:       conn.Expiry,
	})
	refreshed, err := ts.Token()
	if err != nil {
		mu.Unlock()
		return err
	}
	if refreshed.AccessToken != conn.AccessToken {
		_ = s.repo.UpdateAccessToken(ctx, userID, refreshed.AccessToken, refreshed.Expiry)
	}
	mu.Unlock()
	client := oauth2.NewClient(ctx, ts)

	url := fmt.Sprintf("https://www.googleapis.com/calendar/v3/calendars/%s/events", calendarID)
	if conn.SyncToken != nil && *conn.SyncToken != "" {
		url = fmt.Sprintf("%s?syncToken=%s", url, *conn.SyncToken)
	}

	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusGone {
		// Sync token expired; clear and retry once
		_ = s.repo.UpdateSyncToken(ctx, userID, nil)
		if retried {
			return fmt.Errorf("calendarsync: sync token expired and full sync also failed")
		}
		return s.pullChanges(ctx, userID, true)
	}

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("list events status %d: %s", resp.StatusCode, string(body))
	}

	var result struct {
		Items         []googleEvent `json:"items"`
		NextSyncToken string        `json:"nextSyncToken"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return err
	}

	if result.NextSyncToken != "" {
		_ = s.repo.UpdateSyncToken(ctx, userID, &result.NextSyncToken)
	}

	for _, item := range result.Items {
		if item.ID == "" {
			continue
		}

		var taskID string
		var taskTitle string
		var taskStatus string
		var taskUpdatedAt time.Time
		lookupErr := s.repo.pool.QueryRow(ctx,
			`SELECT id, title, status, updated_at FROM tasks WHERE external_event_id=$1 AND user_id=$2`,
			item.ID, userID).Scan(&taskID, &taskTitle, &taskStatus, &taskUpdatedAt)

		if item.Status == "cancelled" {
			if lookupErr == nil && taskID != "" {
				_ = s.tasksRepo.DeleteTask(ctx, taskID, userID)
			}
			continue
		}

		var parsedDue *time.Time
		if item.Start.DateTime != "" {
			t, err := time.Parse(time.RFC3339, item.Start.DateTime)
			if err == nil {
				parsedDue = &t
			}
		}

		cleanTitle := item.Summary
		lowerTitle := strings.ToLower(cleanTitle)
		if strings.HasPrefix(lowerTitle, "[done]") {
			cleanTitle = strings.TrimSpace(cleanTitle[6:])
		} else if strings.HasPrefix(lowerTitle, "[failed]") {
			cleanTitle = strings.TrimSpace(cleanTitle[8:])
		} else if strings.HasPrefix(lowerTitle, "[todo]") {
			cleanTitle = strings.TrimSpace(cleanTitle[6:])
		} else if strings.HasPrefix(lowerTitle, "[in progress]") {
			cleanTitle = strings.TrimSpace(cleanTitle[13:])
		}

		cleanDesc := item.Description
		if idx := strings.Index(cleanDesc, "\n\nLink to task:"); idx != -1 {
			cleanDesc = strings.TrimSpace(cleanDesc[:idx])
		}

		if lookupErr == nil && taskID != "" {
			var googleUpdated time.Time
			if item.Updated != "" {
				googleUpdated, _ = time.Parse(time.RFC3339, item.Updated)
			}

			if googleUpdated.After(taskUpdatedAt.Add(5 * time.Second)) {
				newStatus := taskStatus
				if strings.HasPrefix(lowerTitle, "[done]") {
					newStatus = "done"
				} else if strings.HasPrefix(lowerTitle, "[failed]") {
					newStatus = "failed"
				}

				_, _ = s.tasksRepo.UpdateTask(ctx, taskID, userID, tasks.UpdateRequest{
					Title:       &cleanTitle,
					Description: &cleanDesc,
					DueDate:     parsedDue,
					Status:      &newStatus,
				})
				// Stamp updated_at with the Google event's own timestamp so the guard stays stable
				if !googleUpdated.IsZero() {
					_, _ = s.repo.pool.Exec(ctx,
						`UPDATE tasks SET updated_at=$1 WHERE id=$2 AND user_id=$3`,
						googleUpdated, taskID, userID)
				}
			}
		} else if errors.Is(lookupErr, pgx.ErrNoRows) {
			status := "todo"
			if strings.HasPrefix(lowerTitle, "[done]") {
				status = "done"
			} else if strings.HasPrefix(lowerTitle, "[failed]") {
				status = "failed"
			}

			created, err := s.tasksRepo.CreateTask(ctx, userID, tasks.CreateRequest{
				Title:       cleanTitle,
				Description: cleanDesc,
				Status:      status,
				DueDate:     parsedDue,
			})
			if err == nil && created != nil {
				_ = s.repo.UpdateTaskExternalEventID(ctx, created.ID, &item.ID)
			}
		}
	}

	return nil
}

// DeleteEvent removes a Google Calendar event for a user.
func (s *Service) DeleteEvent(ctx context.Context, userID, eventID string) error {
	conn, err := s.repo.GetConnection(ctx, userID)
	if errors.Is(err, ErrNotFound) {
		return nil
	}
	if err != nil {
		return err
	}

	calendarID := "primary"
	if conn.GoogleCalendarID != nil && *conn.GoogleCalendarID != "" {
		calendarID = *conn.GoogleCalendarID
	}

	ts := s.googleConfig.TokenSource(ctx, &oauth2.Token{
		AccessToken:  conn.AccessToken,
		RefreshToken: conn.RefreshToken,
		Expiry:       conn.Expiry,
	})

	refreshed, err := ts.Token()
	if err != nil {
		return err
	}

	if refreshed.AccessToken != conn.AccessToken {
		_ = s.repo.UpdateAccessToken(ctx, userID, refreshed.AccessToken, refreshed.Expiry)
	}

	client := oauth2.NewClient(ctx, ts)
	return s.deleteEvent(ctx, client, calendarID, eventID)
}

func (s *Service) deleteEvent(ctx context.Context, client *http.Client, calendarID, eventID string) error {
	url := fmt.Sprintf("https://www.googleapis.com/calendar/v3/calendars/%s/events/%s", calendarID, eventID)
	req, _ := http.NewRequestWithContext(ctx, http.MethodDelete, url, nil)
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusNoContent && resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusNotFound {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("google calendar delete status %d: %s", resp.StatusCode, string(body))
	}
	return nil
}
