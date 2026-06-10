package auth

import (
	"context"
	"net/http"
	"strings"

	"github.com/SachPlayZ/rivz-asn/backend/internal/httputil"
)

// contextKey is a private type for context keys to avoid collisions.
type contextKey struct{ name string }

// userIDKey is the context key under which the authenticated user's ID is stored.
var userIDKey = &contextKey{"userID"}

// Authenticate returns middleware that validates a Bearer JWT and stores the
// userID in the request context. Returns 401 if the token is missing or invalid.
func Authenticate(jwtSecret string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			header := r.Header.Get("Authorization")
			if header == "" || !strings.HasPrefix(header, "Bearer ") {
				httputil.Error(w, http.StatusUnauthorized, "missing or invalid authorization header")
				return
			}

			tokenStr := strings.TrimPrefix(header, "Bearer ")
			userID, err := ValidateToken(tokenStr, jwtSecret)
			if err != nil {
				httputil.Error(w, http.StatusUnauthorized, "invalid or expired token")
				return
			}

			ctx := context.WithValue(r.Context(), userIDKey, userID)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// UserIDFromContext retrieves the authenticated user's ID from the context.
// Returns an empty string if not present.
func UserIDFromContext(ctx context.Context) string {
	v, _ := ctx.Value(userIDKey).(string)
	return v
}
