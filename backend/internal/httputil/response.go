// Package httputil provides HTTP response helpers for consistent JSON encoding
// and error envelopes.
package httputil

import (
	"encoding/json"
	"net/http"
)

// JSON writes v as a JSON response with the given status code.
func JSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

type errorBody struct {
	Error errorDetail `json:"error"`
}

type errorDetail struct {
	Message string            `json:"message"`
	Fields  map[string]string `json:"fields,omitempty"`
}

// Error writes a JSON error response with the given status and message.
func Error(w http.ResponseWriter, status int, msg string) {
	JSON(w, status, errorBody{Error: errorDetail{Message: msg}})
}

// ValidationError writes a 400 JSON error response containing per-field messages.
func ValidationError(w http.ResponseWriter, fields map[string]string) {
	JSON(w, http.StatusBadRequest, errorBody{
		Error: errorDetail{
			Message: "validation failed",
			Fields:  fields,
		},
	})
}
