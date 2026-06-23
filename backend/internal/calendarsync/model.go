package calendarsync

import "time"

// CalendarConnection represents the database record for linked calendar credentials.
type CalendarConnection struct {
	ID               string    `json:"id"`
	UserID           string    `json:"user_id"`
	Provider         string    `json:"provider"`
	Email            string    `json:"email"`
	AccessToken      string    `json:"access_token"`
	RefreshToken     string    `json:"refresh_token"`
	Expiry           time.Time `json:"expiry"`
	GoogleCalendarID *string   `json:"google_calendar_id"`
	SyncToken        *string   `json:"sync_token"`
	CreatedAt        time.Time `json:"created_at"`
	UpdatedAt        time.Time `json:"updated_at"`
}

// ConnectionStatus represents the API status payload returned to the frontend.
type ConnectionStatus struct {
	Connected bool   `json:"connected"`
	Email     string `json:"email,omitempty"`
}
