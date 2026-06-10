// Command api starts the task-management REST API server.
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

	"github.com/SachPlayZ/rivz-asn/backend/internal/auth"
	"github.com/SachPlayZ/rivz-asn/backend/internal/config"
	"github.com/SachPlayZ/rivz-asn/backend/internal/db"
	"github.com/SachPlayZ/rivz-asn/backend/internal/server"
	"github.com/SachPlayZ/rivz-asn/backend/internal/tasks"
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

	// Convert postgres:// URL to pgx5:// scheme required by golang-migrate.
	migrateURL := toPgx5URL(cfg.DatabaseURL)
	if err := db.RunMigrations(migrateURL); err != nil {
		return fmt.Errorf("run migrations: %w", err)
	}

	// Wire dependencies.
	authRepo := auth.NewRepository(pool)
	authSvc := auth.NewService(authRepo, cfg.JWTSecret)
	authHandler := auth.NewHandler(authSvc)

	tasksRepo := tasks.NewRepository(pool)
	tasksSvc := tasks.NewService(tasksRepo)
	tasksHandler := tasks.NewHandler(tasksSvc)

	handler := server.New(server.ServerConfig{
		JWTSecret:  cfg.JWTSecret,
		CORSOrigin: cfg.CORSOrigin,
	}, authHandler, tasksHandler)

	srv := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      handler,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Graceful shutdown.
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

	shutCtx, shutCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutCancel()

	if err := srv.Shutdown(shutCtx); err != nil {
		return fmt.Errorf("server shutdown: %w", err)
	}

	log.Println("server stopped")
	return nil
}

// toPgx5URL converts a postgres:// or postgresql:// URL to the pgx5:// scheme
// used by golang-migrate's pgx/v5 driver.
func toPgx5URL(u string) string {
	for _, prefix := range []string{"postgresql://", "postgres://"} {
		if len(u) > len(prefix) && u[:len(prefix)] == prefix {
			return "pgx5://" + u[len(prefix):]
		}
	}
	return u
}
