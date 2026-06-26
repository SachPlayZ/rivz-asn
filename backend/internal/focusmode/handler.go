package focusmode

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"github.com/SachPlayZ/rivz-asn/backend/internal/auth"
	"github.com/SachPlayZ/rivz-asn/backend/internal/httputil"
	"github.com/go-chi/chi/v5"
)

// Handler handles HTTP requests for focus sessions.
type Handler struct {
	svc *Service
}

// NewHandler creates a new focus Handler.
func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// Start handles POST /focus/start.
func (h *Handler) Start(w http.ResponseWriter, r *http.Request) {
	userID := auth.UserIDFromContext(r.Context())
	if userID == "" {
		httputil.Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req StartRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid body")
		return
	}

	session, err := h.svc.Start(r.Context(), userID, &req)
	if err != nil {
		var ase *ActiveSessionError
		if errors.As(err, &ase) {
			httputil.Error(w, http.StatusConflict, "session already active")
			return
		}
		httputil.Error(w, http.StatusInternalServerError, "failed to start session")
		return
	}

	httputil.JSON(w, http.StatusCreated, session)
}

// End handles POST /focus/end.
func (h *Handler) End(w http.ResponseWriter, r *http.Request) {
	userID := auth.UserIDFromContext(r.Context())
	if userID == "" {
		httputil.Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req EndRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid body")
		return
	}

	session, err := h.svc.End(r.Context(), userID, &req)
	if err != nil {
		var nase *NoActiveSessionError
		if errors.As(err, &nase) {
			httputil.Error(w, http.StatusNotFound, "no active session")
			return
		}
		httputil.Error(w, http.StatusInternalServerError, "failed to end session")
		return
	}

	httputil.JSON(w, http.StatusOK, session)
}

// Active handles GET /focus/active.
func (h *Handler) Active(w http.ResponseWriter, r *http.Request) {
	userID := auth.UserIDFromContext(r.Context())
	if userID == "" {
		httputil.Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	session, err := h.svc.GetActive(r.Context(), userID)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "failed to get active session")
		return
	}
	if session == nil {
		httputil.JSON(w, http.StatusOK, map[string]interface{}{"session": nil})
		return
	}

	httputil.JSON(w, http.StatusOK, map[string]interface{}{"session": session})
}

// History handles GET /focus/history.
func (h *Handler) History(w http.ResponseWriter, r *http.Request) {
	userID := auth.UserIDFromContext(r.Context())
	if userID == "" {
		httputil.Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))

	result, err := h.svc.List(r.Context(), userID, ListParams{Page: page, Limit: limit})
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "failed to list sessions")
		return
	}

	httputil.JSON(w, http.StatusOK, result)
}

// Get handles GET /focus/{id}.
func (h *Handler) Get(w http.ResponseWriter, r *http.Request) {
	userID := auth.UserIDFromContext(r.Context())
	if userID == "" {
		httputil.Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	id := chi.URLParam(r, "id")
	session, err := h.svc.GetByID(r.Context(), id, userID)
	if err != nil {
		httputil.Error(w, http.StatusNotFound, "session not found")
		return
	}

	httputil.JSON(w, http.StatusOK, session)
}

// Update handles PATCH /focus/{id}.
func (h *Handler) Update(w http.ResponseWriter, r *http.Request) {
	userID := auth.UserIDFromContext(r.Context())
	if userID == "" {
		httputil.Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	id := chi.URLParam(r, "id")

	var req UpdateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid body")
		return
	}

	if err := h.svc.Update(r.Context(), id, userID, &req); err != nil {
		httputil.Error(w, http.StatusInternalServerError, "failed to update session")
		return
	}

	httputil.JSON(w, http.StatusOK, map[string]string{"status": "updated"})
}

// Delete handles DELETE /focus/{id}.
func (h *Handler) Delete(w http.ResponseWriter, r *http.Request) {
	userID := auth.UserIDFromContext(r.Context())
	if userID == "" {
		httputil.Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	id := chi.URLParam(r, "id")

	if err := h.svc.Delete(r.Context(), id, userID); err != nil {
		httputil.Error(w, http.StatusInternalServerError, "failed to delete session")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// Stats handles GET /focus/stats.
func (h *Handler) Stats(w http.ResponseWriter, r *http.Request) {
	userID := auth.UserIDFromContext(r.Context())
	if userID == "" {
		httputil.Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	stats, err := h.svc.Stats(r.Context(), userID)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "failed to get stats")
		return
	}

	httputil.JSON(w, http.StatusOK, stats)
}
