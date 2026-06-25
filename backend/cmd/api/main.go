package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/SachPlayZ/rivz-asn/backend/internal/activitylog"
	"github.com/SachPlayZ/rivz-asn/backend/internal/admin"
	"github.com/SachPlayZ/rivz-asn/backend/internal/apitokens"
	"github.com/SachPlayZ/rivz-asn/backend/internal/attachments"
	"github.com/SachPlayZ/rivz-asn/backend/internal/auth"
	"github.com/SachPlayZ/rivz-asn/backend/internal/automations"
	"github.com/SachPlayZ/rivz-asn/backend/internal/calendarsync"
	"github.com/SachPlayZ/rivz-asn/backend/internal/comments"
	"github.com/SachPlayZ/rivz-asn/backend/internal/config"
	"github.com/SachPlayZ/rivz-asn/backend/internal/customfields"
	"github.com/SachPlayZ/rivz-asn/backend/internal/dashboard"
	"github.com/SachPlayZ/rivz-asn/backend/internal/db"
	"github.com/SachPlayZ/rivz-asn/backend/internal/dependencies"
	emailpkg "github.com/SachPlayZ/rivz-asn/backend/internal/email"
	githubpkg "github.com/SachPlayZ/rivz-asn/backend/internal/github"
	"github.com/SachPlayZ/rivz-asn/backend/internal/goals"
	"github.com/SachPlayZ/rivz-asn/backend/internal/groq"
	"github.com/SachPlayZ/rivz-asn/backend/internal/habits"
	"github.com/SachPlayZ/rivz-asn/backend/internal/inbox"
	"github.com/SachPlayZ/rivz-asn/backend/internal/notes"
	"github.com/SachPlayZ/rivz-asn/backend/internal/notifications"
	"github.com/SachPlayZ/rivz-asn/backend/internal/pomodoro"
	"github.com/SachPlayZ/rivz-asn/backend/internal/projects"
	"github.com/SachPlayZ/rivz-asn/backend/internal/reminders"
	"github.com/SachPlayZ/rivz-asn/backend/internal/savedfilters"
	"github.com/SachPlayZ/rivz-asn/backend/internal/scheduler"
	"github.com/SachPlayZ/rivz-asn/backend/internal/search"
	"github.com/SachPlayZ/rivz-asn/backend/internal/server"
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
)

func main() {
	if err := run(); err != nil {
		log.Fatalf("fatal: %v", err)
	}
}

func run() error {
	cfg, err := config.Load()
	if err != nil {
		return fmt.Errorf("load config: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	pool, err := db.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		return fmt.Errorf("connect db: %w", err)
	}
	defer pool.Close()

	migrateURL := toPgx5URL(cfg.DatabaseURL)
	if err := db.RunMigrations(migrateURL); err != nil {
		return fmt.Errorf("run migrations: %w", err)
	}

	// S3 Client.
	var s3Client *attachments.S3Client
	if cfg.S3Bucket != "" {
		s3Client, err = attachments.NewS3Client(
			context.Background(),
			cfg.AWSRegion, cfg.AWSAccessKeyID, cfg.AWSSecretAccessKey, cfg.S3Bucket,
		)
		if err != nil {
			return fmt.Errorf("init s3 client: %w", err)
		}
	}

	// Auth.
	authRepo := auth.NewRepository(pool)
	var emailClient *emailpkg.Client
	if cfg.SMTPHost != "" {
		emailClient = emailpkg.New(cfg.SMTPHost, cfg.SMTPPort, cfg.SMTPUser, cfg.SMTPPass, cfg.FromEmail)
		if err := emailClient.Ping(); err != nil {
			log.Printf("WARNING: SMTP health check failed — email delivery may not work: %v", err)
		} else {
			log.Println("SMTP: connection OK")
		}
	}
	authSvc := auth.NewService(authRepo, cfg.JWTSecret, emailClient, cfg.FrontendURL, s3Client)
	authHandler := auth.NewHandler(authSvc)
	oauthHandler := auth.NewOAuthHandler(
		cfg.GoogleClientID, cfg.GoogleClientSecret,
		cfg.GitHubClientID, cfg.GitHubClientSecret,
		cfg.AppURL, cfg.FrontendURL, cfg.JWTSecret,
		authRepo, authSvc,
	)

	// Activity log.
	activityRepo := activitylog.NewRepository(pool)
	activitySvc := activitylog.NewService(activityRepo)

	// SSE.
	sseBroker := sse.NewBroker()
	sseHandler := sse.NewHandler(sseBroker, cfg.JWTSecret)

	// Notifications.
	notifRepo := notifications.NewRepository(pool)
	notifSvc := notifications.NewService(notifRepo, sseBroker)
	notifHandler := notifications.NewHandler(notifSvc)

	// Tasks.
	tasksRepo := tasks.NewRepository(pool)
	tasksSvc := tasks.NewService(tasksRepo, activitySvc, sseBroker)
	tasksSvc.SetNotificationsService(notifSvc)
	tasksHandler := tasks.NewHandler(tasksSvc, activitySvc)

	// Google Calendar Sync.
	calendarSyncRepo := calendarsync.NewRepository(pool)
	calendarSyncSvc := calendarsync.NewService(
		calendarSyncRepo,
		tasksRepo,
		cfg.GoogleClientID, cfg.GoogleClientSecret,
		cfg.AppURL, cfg.FrontendURL, cfg.JWTSecret,
	)
	calendarSyncHandler := calendarsync.NewHandler(calendarSyncSvc, cfg.JWTSecret)
	tasksSvc.SetCalendarSyncService(calendarSyncSvc)

	// Admin.
	adminHandler := admin.NewHandler(pool)

	// Attachments.
	attachmentsRepo := attachments.NewRepository(pool)
	attachmentsSvc := attachments.NewService(attachmentsRepo, s3Client)
	attachmentsHandler := attachments.NewHandler(attachmentsSvc, tasksSvc, cfg.S3Bucket)

	// Subtasks.
	subtasksRepo := subtasks.NewRepository(pool)
	subtasksSvc := subtasks.NewService(subtasksRepo)
	subtasksHandler := subtasks.NewHandler(subtasksSvc, tasksSvc)

	// Tags.
	tagsRepo := tags.NewRepository(pool)
	tagsSvc := tags.NewService(tagsRepo)
	tagsHandler := tags.NewHandler(tagsSvc)

	// Comments.
	commentsRepo := comments.NewRepository(pool)
	commentsSvc := comments.NewService(commentsRepo, notifSvc, pool)
	commentsHandler := comments.NewHandler(commentsSvc)

	// Dependencies.
	depsRepo := dependencies.NewRepository(pool)
	depsSvc := dependencies.NewService(depsRepo, notifSvc)
	depsHandler := dependencies.NewHandler(depsSvc)
	tasksSvc.SetDependenciesService(depsSvc)

	// Projects.
	projectsRepo := projects.NewRepository(pool)
	projectsSvc := projects.NewService(projectsRepo)
	projectsHandler := projects.NewHandler(projectsSvc)

	// Time tracking.
	timeRepo := timetracking.NewRepository(pool)
	timeSvc := timetracking.NewService(timeRepo)
	timeHandler := timetracking.NewHandler(timeSvc)

	// Sprints.
	sprintsRepo := sprints.NewRepository(pool)
	sprintsSvc := sprints.NewService(sprintsRepo)
	sprintsHandler := sprints.NewHandler(sprintsSvc)

	// Templates.
	templatesRepo := templates.NewRepository(pool)
	templatesSvc := templates.NewService(templatesRepo)
	templatesHandler := templates.NewHandler(templatesSvc)

	// Custom fields.
	cfRepo := customfields.NewRepository(pool)
	cfSvc := customfields.NewService(cfRepo)
	cfHandler := customfields.NewHandler(cfSvc)

	// Watchers.
	watchersRepo := watchers.NewRepository(pool)
	watchersSvc := watchers.NewService(watchersRepo, notifSvc)
	watchersHandler := watchers.NewHandler(watchersSvc)
	tasksSvc.SetWatchersService(watchersSvc)

	// Saved filters.
	sfRepo := savedfilters.NewRepository(pool)
	sfSvc := savedfilters.NewService(sfRepo)
	sfHandler := savedfilters.NewHandler(sfSvc)

	// API tokens.
	apiTokensRepo := apitokens.NewRepository(pool)
	apiTokensSvc := apitokens.NewService(apiTokensRepo)
	apiTokensHandler := apitokens.NewHandler(apiTokensSvc)

	// TOTP.
	totpRepo := totppkg.NewRepository(pool)
	totpSvc := totppkg.NewService(totpRepo)
	totpHandler := totppkg.NewHandler(totpSvc)

	// Outbound webhooks.
	webhooksRepo := webhooks.NewRepository(pool)
	webhooksSvc := webhooks.NewService(webhooksRepo)
	webhooksHandler := webhooks.NewHandler(webhooksSvc)
	tasksSvc.SetWebhooksService(webhooksSvc)

	// GitHub integration.
	githubRepo := githubpkg.NewRepository(pool)
	githubSvc := githubpkg.NewService(githubRepo, tasksSvc, cfg.GitHubWebhookSecret)
	githubHandler := githubpkg.NewHandler(githubSvc)

	// Task sharing.
	sharingRepo := sharing.NewRepository(pool)
	sharingSvc := sharing.NewService(sharingRepo)
	sharingHandler := sharing.NewHandler(sharingSvc, pool)

	// Pomodoro.
	pomodoroRepo := pomodoro.NewRepository(pool)
	pomodoroSvc := pomodoro.NewService(pomodoroRepo)
	pomodoroSvc.SetTimeTracker(timeSvc)
	pomodoroHandler := pomodoro.NewHandler(pomodoroSvc)

	// Email-to-task inbound.
	inboxRepo := inbox.NewRepository(pool)
	inboxHandler := inbox.NewHandler(inboxRepo, tasksSvc, cfg.ResendAPIKey, cfg.InboxDomain)

	// Automations engine.
	automationsRepo := automations.NewRepository(pool)
	automationsSvc := automations.NewService(automationsRepo, notifSvc)
	automationsHandler := automations.NewHandler(automationsSvc)
	tasksSvc.SetAutomationEngine(automationsSvc)

	// Reminders.
	remindersRepo := reminders.NewRepository(pool)
	remindersHandler := reminders.NewHandler(remindersRepo)

	// Goals / OKRs.
	goalsRepo := goals.NewRepository(pool)
	goalsSvc := goals.NewService(goalsRepo)
	goalsHandler := goals.NewHandler(goalsSvc)

	// Habits.
	habitsRepo := habits.NewRepository(pool)
	habitsSvc := habits.NewService(habitsRepo)
	habitsHandler := habits.NewHandler(habitsSvc)

	// Personal dashboard.
	dashboardSvc := dashboard.NewService(pool, habitsSvc)
	dashboardHandler := dashboard.NewHandler(dashboardSvc)

	// Notes / Docs.
	notesRepo := notes.NewRepository(pool)
	notesSvc := notes.NewService(notesRepo, sseBroker, s3Client)
	notesHandler := notes.NewHandler(notesSvc)

	// Global search.
	searchSvc := search.NewService(pool)
	searchHandler := search.NewHandler(searchSvc)

	// Web push + unified notification delivery (email / web push / chat).
	webpushRepo := webpush.NewRepository(pool)
	webpushSvc := webpush.NewService(webpushRepo, webpush.Config{
		PublicKey:  cfg.VAPIDPublicKey,
		PrivateKey: cfg.VAPIDPrivateKey,
		Subject:    cfg.VAPIDSubject,
	})
	webpushHandler := webpush.NewHandler(webpushSvc)
	notifSvc.SetDeliverers(emailClient, webpushSvc, cfg.FrontendURL)

	// Groq AI.
	var groqClient *groq.Client
	var groqHandler *groq.Handler
	if cfg.GroqAPIKey != "" {
		groqClient = groq.NewClient(cfg.GroqAPIKey)
		groqHandler = groq.NewHandler(groqClient, tasksSvc)
	}

	// Scheduler.
	schedulerCtx, schedulerCancel := context.WithCancel(context.Background())
	defer schedulerCancel()
	go scheduler.Start(schedulerCtx, pool, notifSvc, cfg, calendarSyncSvc, tasksSvc)

	// Telegram bot.
	var telegramHandler *telegram.Handler
	if cfg.TelegramBotToken != "" {
		telegramRepo := telegram.NewRepository(pool)
		telegramSvc := telegram.NewService(telegramRepo, tasksSvc, cfg.TelegramBotToken, groqClient)
		telegramHandler = telegram.NewHandler(telegramSvc)
		go telegramSvc.StartPolling(schedulerCtx)
		log.Println("Telegram bot polling started")
	}

	handler := server.New(server.ServerConfig{
		JWTSecret:  cfg.JWTSecret,
		CORSOrigin: cfg.CORSOrigin,
	},
		authHandler, oauthHandler, tasksHandler, adminHandler, sseHandler, attachmentsHandler,
		subtasksHandler, tagsHandler, commentsHandler, depsHandler, notifHandler,
		projectsHandler, timeHandler, sprintsHandler, templatesHandler,
		cfHandler, watchersHandler, sfHandler, apiTokensHandler, totpHandler,
		webhooksHandler, githubHandler, sharingHandler, pomodoroHandler,
		groqHandler, apiTokensSvc, webpushHandler, notesHandler, searchHandler,
		habitsHandler, dashboardHandler, goalsHandler, remindersHandler,
		automationsHandler, inboxHandler, calendarSyncHandler, telegramHandler,
	)

	srv := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      handler,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 0,
		IdleTimeout:  60 * time.Second,
	}

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		log.Printf("server listening on :%s", cfg.Port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("listen: %v", err)
		}
	}()

	<-quit
	log.Println("shutting down server...")
	schedulerCancel()

	shutCtx, shutCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutCancel()

	if err := srv.Shutdown(shutCtx); err != nil {
		return fmt.Errorf("server shutdown: %w", err)
	}

	log.Println("server stopped")
	return nil
}

func toPgx5URL(u string) string {
	for _, prefix := range []string{"postgresql://", "postgres://"} {
		if len(u) > len(prefix) && u[:len(prefix)] == prefix {
			return "pgx5://" + u[len(prefix):]
		}
	}
	return u
}
