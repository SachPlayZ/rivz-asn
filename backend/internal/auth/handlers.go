package auth

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/SachPlayZ/rivz-asn/backend/internal/httputil"
	"github.com/go-playground/validator/v10"
)

// Handler handles HTTP requests for authentication endpoints.
type Handler struct {
	svc      *Service
	validate *validator.Validate
}

// NewHandler creates a new auth Handler.
func NewHandler(svc *Service) *Handler {
	return &Handler{
		svc:      svc,
		validate: validator.New(),
	}
}

type signupRequest struct {
	Email    string `json:"email"    validate:"required,email"`
	Password string `json:"password" validate:"required,min=8"`
}

// Signup handles POST /auth/signup.
func (h *Handler) Signup(w http.ResponseWriter, r *http.Request) {
	var req signupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if errs := h.validate.Struct(req); errs != nil {
		httputil.ValidationError(w, validationFields(errs.(validator.ValidationErrors)))
		return
	}

	result, err := h.svc.Signup(r.Context(), strings.ToLower(req.Email), req.Password)
	if err != nil {
		if isDuplicateEmailError(err) {
			httputil.Error(w, http.StatusConflict, "email already registered")
			return
		}
		httputil.Error(w, http.StatusInternalServerError, "signup failed")
		return
	}

	httputil.JSON(w, http.StatusCreated, authResponse{
		Token: result.Token,
		User:  PublicUser{ID: result.User.ID, Email: result.User.Email},
	})
}

type loginRequest struct {
	Email    string `json:"email"    validate:"required,email"`
	Password string `json:"password" validate:"required"`
}

// Login handles POST /auth/login.
func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if errs := h.validate.Struct(req); errs != nil {
		httputil.ValidationError(w, validationFields(errs.(validator.ValidationErrors)))
		return
	}

	result, err := h.svc.Login(r.Context(), strings.ToLower(req.Email), req.Password)
	if err != nil {
		httputil.Error(w, http.StatusUnauthorized, "invalid email or password")
		return
	}

	httputil.JSON(w, http.StatusOK, authResponse{
		Token: result.Token,
		User:  PublicUser{ID: result.User.ID, Email: result.User.Email},
	})
}

// Me handles GET /auth/me — returns the authenticated user's profile.
func (h *Handler) Me(w http.ResponseWriter, r *http.Request) {
	userID := UserIDFromContext(r.Context())
	if userID == "" {
		httputil.Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	user, err := h.svc.GetUser(r.Context(), userID)
	if err != nil {
		httputil.Error(w, http.StatusUnauthorized, "user not found")
		return
	}

	httputil.JSON(w, http.StatusOK, PublicUser{ID: user.ID, Email: user.Email})
}

// validationFields converts validator.ValidationErrors into a string map.
func validationFields(errs validator.ValidationErrors) map[string]string {
	fields := make(map[string]string, len(errs))
	for _, e := range errs {
		fields[strings.ToLower(e.Field())] = e.Tag()
	}
	return fields
}

// isDuplicateEmailError reports whether the error originates from a unique constraint
// violation on the email column (Postgres error code 23505).
func isDuplicateEmailError(err error) bool {
	return err != nil && strings.Contains(err.Error(), "23505")
}
