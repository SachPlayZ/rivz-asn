package server

import (
	"context"
	"net/http"

	"github.com/SachPlayZ/rivz-asn/backend/internal/admin"
	"github.com/SachPlayZ/rivz-asn/backend/internal/apitokens"
	"github.com/SachPlayZ/rivz-asn/backend/internal/attachments"
	"github.com/SachPlayZ/rivz-asn/backend/internal/auth"
	"github.com/SachPlayZ/rivz-asn/backend/internal/automations"
	"github.com/SachPlayZ/rivz-asn/backend/internal/comments"
	"github.com/SachPlayZ/rivz-asn/backend/internal/calendarsync"
	"github.com/SachPlayZ/rivz-asn/backend/internal/customfields"
	"github.com/SachPlayZ/rivz-asn/backend/internal/dashboard"
	"github.com/SachPlayZ/rivz-asn/backend/internal/dependencies"
	githubpkg "github.com/SachPlayZ/rivz-asn/backend/internal/github"
	"github.com/SachPlayZ/rivz-asn/backend/internal/goals"
	"github.com/SachPlayZ/rivz-asn/backend/internal/groq"
	"github.com/SachPlayZ/rivz-asn/backend/internal/habits"
	"github.com/SachPlayZ/rivz-asn/backend/internal/httputil"
	"github.com/SachPlayZ/rivz-asn/backend/internal/inbox"
	"github.com/SachPlayZ/rivz-asn/backend/internal/notes"
	"github.com/SachPlayZ/rivz-asn/backend/internal/notifications"
	"github.com/SachPlayZ/rivz-asn/backend/internal/pomodoro"
	"github.com/SachPlayZ/rivz-asn/backend/internal/projects"
	"github.com/SachPlayZ/rivz-asn/backend/internal/reminders"
	"github.com/SachPlayZ/rivz-asn/backend/internal/savedfilters"
	"github.com/SachPlayZ/rivz-asn/backend/internal/search"
	"github.com/SachPlayZ/rivz-asn/backend/internal/sharing"
	"github.com/SachPlayZ/rivz-asn/backend/internal/sprints"
	"github.com/SachPlayZ/rivz-asn/backend/internal/sse"
	"github.com/SachPlayZ/rivz-asn/backend/internal/subtasks"
	"github.com/SachPlayZ/rivz-asn/backend/internal/tags"
	"github.com/SachPlayZ/rivz-asn/backend/internal/tasks"
	"github.com/SachPlayZ/rivz-asn/backend/internal/telegram"
	"github.com/SachPlayZ/rivz-asn/backend/internal/templates"
	"github.com/SachPlayZ/rivz-asn/backend/internal/timetracking"
	totppkg "github.com/SachPlayZ/rivz-asn/backend/internal/totp"
	"github.com/SachPlayZ/rivz-asn/backend/internal/watchers"
	"github.com/SachPlayZ/rivz-asn/backend/internal/webhooks"
	"github.com/SachPlayZ/rivz-asn/backend/internal/webpush"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
)

// New builds and returns a configured chi router with all routes registered.
func New(
	cfg ServerConfig,
	authHandler *auth.Handler,
	oauthHandler *auth.OAuthHandler,
	tasksHandler *tasks.Handler,
	adminHandler *admin.Handler,
	sseHandler *sse.Handler,
	attachmentsHandler *attachments.Handler,
	subtasksHandler *subtasks.Handler,
	tagsHandler *tags.Handler,
	commentsHandler *comments.Handler,
	depsHandler *dependencies.Handler,
	notifHandler *notifications.Handler,
	projectsHandler *projects.Handler,
	timeHandler *timetracking.Handler,
	sprintsHandler *sprints.Handler,
	templatesHandler *templates.Handler,
	cfHandler *customfields.Handler,
	watchersHandler *watchers.Handler,
	sfHandler *savedfilters.Handler,
	apiTokensHandler *apitokens.Handler,
	totpHandler *totppkg.Handler,
	webhooksHandler *webhooks.Handler,
	githubHandler *githubpkg.Handler,
	sharingHandler *sharing.Handler,
	pomodoroHandler *pomodoro.Handler,
	groqHandler *groq.Handler,
	apiTokensSvc *apitokens.Service,
	webpushHandler *webpush.Handler,
	notesHandler *notes.Handler,
	searchHandler *search.Handler,
	habitsHandler *habits.Handler,
	dashboardHandler *dashboard.Handler,
	goalsHandler *goals.Handler,
	remindersHandler *reminders.Handler,
	automationsHandler *automations.Handler,
	inboxHandler *inbox.Handler,
	calendarSyncHandler *calendarsync.Handler,
	telegramHandler *telegram.Handler,
) http.Handler {
	r := chi.NewRouter()

	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)

	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{cfg.CORSOrigin, "tauri://localhost", "http://tauri.localhost"},
		AllowedMethods:   []string{"GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "Cache-Control"},
		ExposedHeaders:   []string{"Link", "Content-Type"},
		AllowCredentials: false,
		MaxAge:           300,
	}))

	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		httputil.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

	// Public routes (no auth).
	r.Post("/track", adminHandler.TrackPageView)
	r.Get("/share/{token}", sharingHandler.PublicView)
	r.Post("/webhooks/github", githubHandler.Webhook)
	r.Post("/webhooks/email", inboxHandler.Webhook)

	// Auth routes.
	r.Post("/auth/signup", authHandler.Signup)
	r.Post("/auth/login", authHandler.Login)
	r.Post("/auth/verify-email", authHandler.VerifyEmail)
	r.Post("/auth/resend-verification", authHandler.ResendVerification)
	r.Get("/auth/google", oauthHandler.GoogleLogin)
	r.Get("/auth/google/callback", oauthHandler.GoogleCallback)
	r.Get("/auth/github", oauthHandler.GitHubLogin)
	r.Get("/auth/github/callback", oauthHandler.GitHubCallback)
	r.Get("/auth/avatar/{filename}", authHandler.GetAvatar)
	r.With(auth.Authenticate(cfg.JWTSecret)).Get("/auth/me", authHandler.Me)
	r.With(auth.Authenticate(cfg.JWTSecret)).Patch("/auth/me/preferences", authHandler.UpdatePreferences)
	r.With(auth.Authenticate(cfg.JWTSecret)).Post("/auth/me/avatar", authHandler.UploadAvatar)

	// Google Calendar Sync Public/OAuth Flow Routes
	r.Get("/calendar/connect", calendarSyncHandler.Connect)
	r.Get("/calendar/callback", calendarSyncHandler.Callback)

	// TOTP auth routes (auth required).
	r.With(auth.Authenticate(cfg.JWTSecret)).Post("/auth/totp/setup", totpHandler.Setup)
	r.With(auth.Authenticate(cfg.JWTSecret)).Post("/auth/totp/enable", totpHandler.Enable)
	r.With(auth.Authenticate(cfg.JWTSecret)).Post("/auth/totp/disable", totpHandler.Disable)
	r.With(auth.Authenticate(cfg.JWTSecret)).Get("/auth/totp/status", totpHandler.Status)

	// SSE.
	r.Get("/events", sseHandler.ServeSSE)

	// Note image proxy (public for rendering img tags).
	r.Get("/notes/images/{filename}", notesHandler.GetImage)

	// JWT-protected routes (also accept API tokens via dual middleware).
	r.Group(func(r chi.Router) {
		r.Use(auth.AuthenticateAny(cfg.JWTSecret, &apiTokenAdapter{svc: apiTokensSvc}))

		r.Get("/activity", tasksHandler.GetUserActivity)

		// Tasks.
		r.Post("/tasks/bulk-update", tasksHandler.BulkUpdate)
		r.Post("/tasks/bulk-delete", tasksHandler.BulkDelete)
		r.Put("/tasks/reorder", tasksHandler.Reorder)
		r.Get("/tasks/export.csv", tasksHandler.ExportCSV)
		r.Get("/tasks/calendar.ics", tasksHandler.ExportICS)
		r.Post("/tasks", tasksHandler.Create)
		r.Get("/tasks", tasksHandler.List)
		r.Get("/tasks/{id}", tasksHandler.Get)
		r.Patch("/tasks/{id}", tasksHandler.Update)
		r.Delete("/tasks/{id}", tasksHandler.Delete)
		r.Get("/tasks/{id}/activity", tasksHandler.GetActivity)

		// Attachments.
		r.Post("/tasks/{id}/attachments", attachmentsHandler.Upload)
		r.Get("/tasks/{id}/attachments", attachmentsHandler.List)
		r.Delete("/tasks/{id}/attachments/{attId}", attachmentsHandler.Delete)

		// Subtasks.
		r.Get("/tasks/{id}/subtasks", subtasksHandler.List)
		r.Post("/tasks/{id}/subtasks", subtasksHandler.Create)
		r.Patch("/tasks/{id}/subtasks/{subId}", subtasksHandler.Update)
		r.Delete("/tasks/{id}/subtasks/{subId}", subtasksHandler.Delete)
		r.Put("/tasks/{id}/subtasks/order", subtasksHandler.Reorder)

		// Tags.
		r.Get("/tags", tagsHandler.List)
		r.Post("/tags", tagsHandler.Create)
		r.Delete("/tags/{id}", tagsHandler.Delete)
		r.Post("/tasks/{id}/tags", tagsHandler.AddToTask)
		r.Delete("/tasks/{id}/tags/{tagId}", tagsHandler.RemoveFromTask)

		// Comments.
		r.Get("/tasks/{id}/comments", commentsHandler.List)
		r.Post("/tasks/{id}/comments", commentsHandler.Create)
		r.Patch("/tasks/{id}/comments/{cId}", commentsHandler.Update)
		r.Delete("/tasks/{id}/comments/{cId}", commentsHandler.Delete)

		// Dependencies.
		r.Get("/tasks/{id}/dependencies", depsHandler.Get)
		r.Post("/tasks/{id}/dependencies", depsHandler.Add)
		r.Delete("/tasks/{id}/dependencies/{depId}", depsHandler.Remove)

		// Notifications.
		r.Get("/notifications", notifHandler.List)
		r.Patch("/notifications/{id}/read", notifHandler.MarkRead)
		r.Post("/notifications/{id}/snooze", notifHandler.Snooze)
		r.Post("/notifications/read-all", notifHandler.MarkAllRead)
		r.Get("/notifications/unread-count", notifHandler.UnreadCount)

		// Automations.
		r.Get("/automations", automationsHandler.List)
		r.Post("/automations", automationsHandler.Create)
		r.Patch("/automations/{id}", automationsHandler.Update)
		r.Delete("/automations/{id}", automationsHandler.Delete)

		// Reminders.
		r.Get("/tasks/{id}/reminders", remindersHandler.ListByTask)
		r.Post("/tasks/{id}/reminders", remindersHandler.Create)
		r.Delete("/reminders/{reminderId}", remindersHandler.Delete)

		// Projects.
		r.Get("/projects", projectsHandler.List)
		r.Post("/projects", projectsHandler.Create)
		r.Patch("/projects/{id}", projectsHandler.Update)
		r.Delete("/projects/{id}", projectsHandler.Delete)

		// Time tracking.
		r.Post("/tasks/{id}/time/start", timeHandler.Start)
		r.Post("/tasks/{id}/time/stop/{entryId}", timeHandler.Stop)
		r.Get("/tasks/{id}/time", timeHandler.List)
		r.Delete("/tasks/{id}/time/{entryId}", timeHandler.Delete)
		r.Get("/tasks/{id}/time/active", timeHandler.Active)

		// Sprints.
		r.Get("/sprints", sprintsHandler.List)
		r.Post("/sprints", sprintsHandler.Create)
		r.Patch("/sprints/{id}", sprintsHandler.Update)
		r.Delete("/sprints/{id}", sprintsHandler.Delete)
		r.Get("/sprints/{id}/tasks", sprintsHandler.ListTasks)
		r.Post("/sprints/{id}/tasks", sprintsHandler.AddTask)
		r.Delete("/sprints/{id}/tasks/{taskId}", sprintsHandler.RemoveTask)

		// Templates.
		r.Get("/templates", templatesHandler.List)
		r.Post("/templates", templatesHandler.Create)
		r.Get("/templates/{id}", templatesHandler.Get)
		r.Delete("/templates/{id}", templatesHandler.Delete)

		// Custom fields.
		r.Get("/custom-fields", cfHandler.ListDefs)
		r.Post("/custom-fields", cfHandler.CreateDef)
		r.Delete("/custom-fields/{id}", cfHandler.DeleteDef)
		r.Get("/tasks/{id}/custom-fields", cfHandler.ListValues)
		r.Put("/tasks/{id}/custom-fields/{fieldId}", cfHandler.SetValue)

		// Watchers.
		r.Get("/tasks/{id}/watchers", watchersHandler.List)
		r.Post("/tasks/{id}/watchers", watchersHandler.Add)
		r.Delete("/tasks/{id}/watchers", watchersHandler.Remove)
		r.Get("/tasks/{id}/watchers/status", watchersHandler.Status)

		// Saved filters.
		r.Get("/saved-filters", sfHandler.List)
		r.Post("/saved-filters", sfHandler.Create)
		r.Delete("/saved-filters/{id}", sfHandler.Delete)

		// GitHub links (per-task).
		r.Get("/tasks/{id}/github", githubHandler.List)
		r.Post("/tasks/{id}/github", githubHandler.Link)
		r.Delete("/tasks/{id}/github/{linkId}", githubHandler.Unlink)

		// Task sharing.
		r.Post("/tasks/{id}/share", sharingHandler.CreateToken)
		r.Delete("/tasks/{id}/share", sharingHandler.RevokeToken)
		r.Get("/tasks/{id}/share", sharingHandler.GetToken)

		// Dashboard.
		r.Get("/dashboard", dashboardHandler.Get)

		// Goals / OKRs.
		r.Get("/goals", goalsHandler.List)
		r.Post("/goals", goalsHandler.Create)
		r.Get("/goals/{id}", goalsHandler.Get)
		r.Patch("/goals/{id}", goalsHandler.Update)
		r.Delete("/goals/{id}", goalsHandler.Delete)
		r.Post("/goals/{id}/key-results", goalsHandler.AddKR)
		r.Patch("/goals/{id}/key-results/{krId}", goalsHandler.UpdateKR)
		r.Delete("/goals/{id}/key-results/{krId}", goalsHandler.DeleteKR)
		r.Get("/goals/{id}/tasks", goalsHandler.ListTasks)
		r.Post("/goals/{id}/tasks/{taskId}", goalsHandler.LinkTask)
		r.Delete("/goals/{id}/tasks/{taskId}", goalsHandler.UnlinkTask)

		// Habits.
		r.Get("/habits", habitsHandler.List)
		r.Post("/habits", habitsHandler.Create)
		r.Patch("/habits/{id}", habitsHandler.Update)
		r.Delete("/habits/{id}", habitsHandler.Delete)
		r.Post("/habits/{id}/toggle", habitsHandler.Toggle)
		r.Get("/habits/{id}/logs", habitsHandler.Logs)

		// Global search.
		r.Get("/search", searchHandler.Search)

		// Notes / Docs.
		r.Get("/notes", notesHandler.List)
		r.Post("/notes", notesHandler.Create)
		r.Post("/notes/images", notesHandler.UploadImage)
		r.Put("/notes/reorder", notesHandler.Reorder)
		r.Get("/notes/{id}", notesHandler.Get)
		r.Patch("/notes/{id}", notesHandler.Update)
		r.Delete("/notes/{id}", notesHandler.Delete)
		r.Get("/notes/{id}/backlinks", notesHandler.Backlinks)
		r.Get("/notes/{id}/tasks", notesHandler.ListTaskLinks)
		r.Post("/notes/{id}/tasks/{taskId}", notesHandler.LinkTask)
		r.Delete("/notes/{id}/tasks/{taskId}", notesHandler.UnlinkTask)
		r.Get("/tasks/{id}/notes", notesHandler.ListByTask)

		// Web push.
		r.Get("/push/public-key", webpushHandler.PublicKey)
		r.Post("/push/subscribe", webpushHandler.Subscribe)
		r.Delete("/push/subscribe", webpushHandler.Unsubscribe)

		// Pomodoro.
		r.Post("/pomodoro/start", pomodoroHandler.Start)
		r.Post("/pomodoro/{id}/complete", pomodoroHandler.Complete)
		r.Post("/pomodoro/{id}/abandon", pomodoroHandler.Abandon)
		r.Get("/pomodoro/history", pomodoroHandler.History)
		r.Get("/pomodoro/active", pomodoroHandler.Active)

		// Settings.
		r.Get("/calendar/status", calendarSyncHandler.Status)
		r.Delete("/calendar/disconnect", calendarSyncHandler.Disconnect)

		r.Get("/settings/api-tokens", apiTokensHandler.List)
		r.Post("/settings/api-tokens", apiTokensHandler.Generate)
		r.Delete("/settings/api-tokens/{id}", apiTokensHandler.Delete)
		r.Get("/settings/webhooks", webhooksHandler.List)
		r.Post("/settings/webhooks", webhooksHandler.Create)
		r.Patch("/settings/webhooks/{id}", webhooksHandler.Update)
		r.Delete("/settings/webhooks/{id}", webhooksHandler.Delete)

		// Inbox status (Issue #4).
		r.Get("/inbox/status", inboxHandler.Status)
		r.Post("/inbox/regenerate-token", inboxHandler.RegenerateToken)

		// Telegram integration (Issue #3).
		if telegramHandler != nil {
			r.Post("/telegram/link", telegramHandler.GenerateCode)
			r.Get("/telegram/link", telegramHandler.Status)
			r.Delete("/telegram/link", telegramHandler.Unlink)
		}

		// AI (only if groqHandler is non-nil).
		if groqHandler != nil {
			r.Post("/ai/parse-task", groqHandler.ParseTask)
			r.Post("/ai/breakdown", groqHandler.BreakdownTask)
			r.Post("/ai/suggest-tags", groqHandler.SuggestTags)
			r.Post("/ai/suggest-priority", groqHandler.SuggestPriority)
			r.Post("/ai/expand-description", groqHandler.ExpandDescription)
			r.Post("/ai/estimate-time", groqHandler.EstimateTime)
			r.Get("/ai/weekly-digest", groqHandler.WeeklyDigest)
			r.Get("/ai/load-alert", groqHandler.LoadAlert)
			r.Post("/ai/plan-day", groqHandler.PlanDay)
		}
	})

	// Admin routes.
	r.Group(func(r chi.Router) {
		r.Use(auth.Authenticate(cfg.JWTSecret))
		r.Use(auth.RequireAdmin)

		r.Get("/admin/tasks", adminHandler.ListTasks)
		r.Get("/admin/users", adminHandler.ListUsers)
		r.Get("/admin/analytics", adminHandler.Analytics)
		r.Get("/admin/site-metrics", adminHandler.SiteMetrics)
	})

	return r
}

// ServerConfig holds the configuration needed to build the server.
type ServerConfig struct {
	JWTSecret  string
	CORSOrigin string
}

// apiTokenAdapter wraps apitokens.Service to implement auth.APITokenValidator.
type apiTokenAdapter struct{ svc *apitokens.Service }

func (a *apiTokenAdapter) ValidateToken(ctx context.Context, rawToken string) (string, error) {
	result, err := a.svc.ValidateToken(ctx, rawToken)
	if err != nil {
		return "", err
	}
	return result.UserID, nil
}
