// Package server wires the HTTP router, middleware, and route registrations.
package server

import (
	"net/http"

	"github.com/SachPlayZ/rivz-asn/backend/internal/auth"
	"github.com/SachPlayZ/rivz-asn/backend/internal/httputil"
	"github.com/SachPlayZ/rivz-asn/backend/internal/tasks"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
)

// New builds and returns a configured chi router with all routes registered.
func New(
	cfg ServerConfig,
	authHandler *auth.Handler,
	tasksHandler *tasks.Handler,
) http.Handler {
	r := chi.NewRouter()

	// Global middleware chain.
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)

	// CORS.
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{cfg.CORSOrigin},
		AllowedMethods:   []string{"GET", "POST", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: false,
		MaxAge:           300,
	}))

	// Health check.
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		httputil.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

	// Auth routes.
	r.Post("/auth/signup", authHandler.Signup)
	r.Post("/auth/login", authHandler.Login)
	r.With(auth.Authenticate(cfg.JWTSecret)).Get("/auth/me", authHandler.Me)

	// Task routes (all JWT-protected).
	r.Group(func(r chi.Router) {
		r.Use(auth.Authenticate(cfg.JWTSecret))

		r.Post("/tasks", tasksHandler.Create)
		r.Get("/tasks", tasksHandler.List)
		r.Get("/tasks/{id}", tasksHandler.Get)
		r.Patch("/tasks/{id}", tasksHandler.Update)
		r.Delete("/tasks/{id}", tasksHandler.Delete)
	})

	return r
}

// ServerConfig holds the configuration needed to build the server.
type ServerConfig struct {
	JWTSecret  string
	CORSOrigin string
}
