package calendarsync

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/SachPlayZ/rivz-asn/backend/internal/auth"
	"github.com/SachPlayZ/rivz-asn/backend/internal/httputil"
	"golang.org/x/oauth2"
)

// Handler manages Google Calendar sync HTTP endpoints.
type Handler struct {
	svc       *Service
	jwtSecret string
}

// NewHandler creates a new Handler.
func NewHandler(svc *Service, jwtSecret string) *Handler {
	return &Handler{svc: svc, jwtSecret: jwtSecret}
}

// Connect initiates the Google OAuth consent flow.
// Expects token parameter in query string due to browser redirects.
func (h *Handler) Connect(w http.ResponseWriter, r *http.Request) {
	tokenStr := r.URL.Query().Get("token")
	if tokenStr == "" {
		http.Error(w, "missing token", http.StatusUnauthorized)
		return
	}

	userID, _, err := auth.ValidateToken(tokenStr, h.jwtSecret)
	if err != nil {
		http.Error(w, "invalid token", http.StatusUnauthorized)
		return
	}

	state := h.newState(userID)
	url := h.svc.googleConfig.AuthCodeURL(state, oauth2.AccessTypeOffline, oauth2.ApprovalForce)
	http.Redirect(w, r, url, http.StatusFound)
}

// Callback handles Google's redirect containing authorization code.
func (h *Handler) Callback(w http.ResponseWriter, r *http.Request) {
	state := r.URL.Query().Get("state")
	userID, err := h.verifyState(state)
	if err != nil {
		http.Redirect(w, r, h.svc.frontendURL+"/settings?tab=calendar&error=invalid_state", http.StatusFound)
		return
	}

	if errCode := r.URL.Query().Get("error"); errCode != "" {
		http.Redirect(w, r, h.svc.frontendURL+"/settings?tab=calendar&error="+errCode, http.StatusFound)
		return
	}

	code := r.URL.Query().Get("code")
	if code == "" {
		http.Redirect(w, r, h.svc.frontendURL+"/settings?tab=calendar&error=missing_code", http.StatusFound)
		return
	}

	if err := h.svc.Connect(r.Context(), userID, code); err != nil {
		log.Printf("calendarsync: failed to connect: %v", err)
		http.Redirect(w, r, h.svc.frontendURL+"/settings?tab=calendar&error=failed_connect", http.StatusFound)
		return
	}

	http.Redirect(w, r, h.svc.frontendURL+"/settings?tab=calendar&success=true", http.StatusFound)
}

// Status returns connection status of current user.
func (h *Handler) Status(w http.ResponseWriter, r *http.Request) {
	userID := auth.UserIDFromContext(r.Context())
	if userID == "" {
		httputil.Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	status, err := h.svc.GetStatus(r.Context(), userID)
	if err != nil {
		httputil.Error(w, http.StatusInternalServerError, "failed to get status")
		return
	}

	httputil.JSON(w, http.StatusOK, status)
}

// Disconnect breaks the Google Calendar connection.
func (h *Handler) Disconnect(w http.ResponseWriter, r *http.Request) {
	userID := auth.UserIDFromContext(r.Context())
	if userID == "" {
		httputil.Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	if err := h.svc.Disconnect(r.Context(), userID); err != nil {
		if errors.Is(err, ErrNotFound) {
			httputil.Error(w, http.StatusNotFound, "connection not found")
			return
		}
		httputil.Error(w, http.StatusInternalServerError, "failed to disconnect")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) newState(userID string) string {
	exp := strconv.FormatInt(time.Now().Add(15*time.Minute).Unix(), 10)
	payload := userID + ":" + exp
	sig := h.sign(payload)
	return payload + "." + sig
}

func (h *Handler) verifyState(state string) (string, error) {
	parts := strings.SplitN(state, ".", 2)
	if len(parts) != 2 {
		return "", errors.New("invalid state format")
	}
	payload, sig := parts[0], parts[1]
	if !hmac.Equal([]byte(h.sign(payload)), []byte(sig)) {
		return "", errors.New("state signature verification failed")
	}
	subParts := strings.SplitN(payload, ":", 2)
	if len(subParts) != 2 {
		return "", errors.New("invalid state payload")
	}
	userID, expStr := subParts[0], subParts[1]
	exp, err := strconv.ParseInt(expStr, 10, 64)
	if err != nil {
		return "", err
	}
	if time.Now().Unix() > exp {
		return "", errors.New("state expired")
	}
	return userID, nil
}

func (h *Handler) sign(msg string) string {
	mac := hmac.New(sha256.New, []byte(h.jwtSecret))
	mac.Write([]byte(msg))
	return hex.EncodeToString(mac.Sum(nil))
}
