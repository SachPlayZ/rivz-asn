package telegram

import (
	"errors"
	"net/http"

	"github.com/SachPlayZ/rivz-asn/backend/internal/auth"
	"github.com/SachPlayZ/rivz-asn/backend/internal/httputil"
)

// Handler exposes Telegram link management endpoints.
type Handler struct {
	svc *Service
}

// NewHandler creates a new Telegram Handler.
func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// GenerateCode handles POST /telegram/link — returns a link code and bot URL.
func (h *Handler) GenerateCode(w http.ResponseWriter, r *http.Request) {
	userID := auth.UserIDFromContext(r.Context())
	code := h.svc.GenerateAuthCode(userID)
	httputil.JSON(w, http.StatusOK, map[string]string{
		"code":    code,
		"bot_url": h.svc.BotURL(code),
	})
}

// Status handles GET /telegram/link — returns link state for the current user.
func (h *Handler) Status(w http.ResponseWriter, r *http.Request) {
	userID := auth.UserIDFromContext(r.Context())
	link, err := h.svc.repo.GetLink(r.Context(), userID)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			httputil.JSON(w, http.StatusOK, LinkStatusResponse{Linked: false})
			return
		}
		httputil.Error(w, http.StatusInternalServerError, "failed to fetch link status")
		return
	}
	httputil.JSON(w, http.StatusOK, LinkStatusResponse{
		Linked:   true,
		Username: link.Username,
	})
}

// Unlink handles DELETE /telegram/link.
func (h *Handler) Unlink(w http.ResponseWriter, r *http.Request) {
	userID := auth.UserIDFromContext(r.Context())
	if err := h.svc.repo.UnlinkUser(r.Context(), userID); err != nil {
		if errors.Is(err, ErrNotFound) {
			httputil.Error(w, http.StatusNotFound, "no telegram link found")
			return
		}
		httputil.Error(w, http.StatusInternalServerError, "failed to unlink")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
