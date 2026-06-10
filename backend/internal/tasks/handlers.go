package tasks

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/SachPlayZ/rivz-asn/backend/internal/auth"
	"github.com/SachPlayZ/rivz-asn/backend/internal/httputil"
	"github.com/go-chi/chi/v5"
	"github.com/go-playground/validator/v10"
)

// Handler handles HTTP requests for task endpoints.
type Handler struct {
	svc      *Service
	validate *validator.Validate
}

// NewHandler creates a new tasks Handler.
func NewHandler(svc *Service) *Handler {
	return &Handler{
		svc:      svc,
		validate: validator.New(),
	}
}

// Create handles POST /tasks.
func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
	userID := auth.UserIDFromContext(r.Context())
	if userID == "" {
		httputil.Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req CreateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if errs := h.validate.Struct(req); errs != nil {
		httputil.ValidationError(w, validationFields(errs.(validator.ValidationErrors)))
		return
	}

	task, err := h.svc.CreateTask(r.Context(), userID, req)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "failed to create task")
		return
	}

	httputil.JSON(w, http.StatusCreated, task)
}

// List handles GET /tasks with optional query params: status, search, sort, order, page, limit.
func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	userID := auth.UserIDFromContext(r.Context())
	if userID == "" {
		httputil.Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	q := r.URL.Query()
	page, _ := strconv.Atoi(q.Get("page"))
	limit, _ := strconv.Atoi(q.Get("limit"))

	p := ListParams{
		Status: q.Get("status"),
		Search: q.Get("search"),
		Sort:   q.Get("sort"),
		Order:  q.Get("order"),
		Page:   page,
		Limit:  limit,
	}

	result, err := h.svc.ListTasks(r.Context(), userID, p)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "failed to list tasks")
		return
	}

	httputil.JSON(w, http.StatusOK, result)
}

// Get handles GET /tasks/{id}.
func (h *Handler) Get(w http.ResponseWriter, r *http.Request) {
	userID := auth.UserIDFromContext(r.Context())
	if userID == "" {
		httputil.Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	id := chi.URLParam(r, "id")
	task, err := h.svc.GetTask(r.Context(), id, userID)
	if err != nil {
		if errors.Is(err, ErrNotFound) || isNoRowsError(err) {
			httputil.Error(w, http.StatusNotFound, "task not found")
			return
		}
		httputil.Error(w, http.StatusInternalServerError, "failed to get task")
		return
	}

	httputil.JSON(w, http.StatusOK, task)
}

// Update handles PATCH /tasks/{id}.
func (h *Handler) Update(w http.ResponseWriter, r *http.Request) {
	userID := auth.UserIDFromContext(r.Context())
	if userID == "" {
		httputil.Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	id := chi.URLParam(r, "id")

	var req UpdateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if errs := h.validate.Struct(req); errs != nil {
		httputil.ValidationError(w, validationFields(errs.(validator.ValidationErrors)))
		return
	}

	task, err := h.svc.UpdateTask(r.Context(), id, userID, req)
	if err != nil {
		if errors.Is(err, ErrNotFound) || isNoRowsError(err) {
			httputil.Error(w, http.StatusNotFound, "task not found")
			return
		}
		httputil.Error(w, http.StatusInternalServerError, "failed to update task")
		return
	}

	httputil.JSON(w, http.StatusOK, task)
}

// Delete handles DELETE /tasks/{id}.
func (h *Handler) Delete(w http.ResponseWriter, r *http.Request) {
	userID := auth.UserIDFromContext(r.Context())
	if userID == "" {
		httputil.Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	id := chi.URLParam(r, "id")
	if err := h.svc.DeleteTask(r.Context(), id, userID); err != nil {
		if errors.Is(err, ErrNotFound) || isNoRowsError(err) {
			httputil.Error(w, http.StatusNotFound, "task not found")
			return
		}
		httputil.Error(w, http.StatusInternalServerError, "failed to delete task")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// validationFields converts validator.ValidationErrors into a field→tag map.
func validationFields(errs validator.ValidationErrors) map[string]string {
	fields := make(map[string]string, len(errs))
	for _, e := range errs {
		fields[strings.ToLower(e.Field())] = e.Tag()
	}
	return fields
}

// isNoRowsError reports whether the error is a pgx "no rows" error.
func isNoRowsError(err error) bool {
	return err != nil && strings.Contains(err.Error(), "no rows")
}
