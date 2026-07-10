package middleware

import (
	"context"
	"net/http"
	"strings"

	"github.com/golang-jwt/jwt/v5"
	"github.com/justlabv1/justspace/backend/internal/repository"
)

type contextKey string

const UserIDKey contextKey = "userID"

func Auth(jwtSecret string, repo *repository.Repo) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			tokenStr := ""
			if auth := r.Header.Get("Authorization"); auth != "" {
				if strings.HasPrefix(auth, "Bearer ") {
					tokenStr = strings.TrimPrefix(auth, "Bearer ")
				}
			}
			if tokenStr == "" {
				if cookie, err := r.Cookie("js_token"); err == nil {
					tokenStr = cookie.Value
				}
			}
			if tokenStr == "" {
				http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
				return
			}
			token, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) {
				if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
					return nil, jwt.ErrSignatureInvalid
				}
				return []byte(jwtSecret), nil
			})
			if err != nil || !token.Valid {
				http.Error(w, `{"error":"invalid token"}`, http.StatusUnauthorized)
				return
			}
			claims, ok := token.Claims.(jwt.MapClaims)
			if !ok {
				http.Error(w, `{"error":"invalid claims"}`, http.StatusUnauthorized)
				return
			}
			userID, ok := claims["sub"].(string)
			if !ok || userID == "" {
				http.Error(w, `{"error":"invalid user"}`, http.StatusUnauthorized)
				return
			}
			active, currentVersion, stateErr := repo.GetUserAuthState(r.Context(), userID)
			if stateErr != nil || !active {
				http.Error(w, `{"error":"account disabled"}`, http.StatusUnauthorized)
				return
			}
			tokenVersion, hasTokenVersion := claims["sv"].(float64)
			if (hasTokenVersion && int64(tokenVersion) != currentVersion) || (!hasTokenVersion && currentVersion != 0) {
				http.Error(w, `{"error":"session expired"}`, http.StatusUnauthorized)
				return
			}
			ctx := context.WithValue(r.Context(), UserIDKey, userID)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func GetUserID(r *http.Request) string {
	if id, ok := r.Context().Value(UserIDKey).(string); ok {
		return id
	}
	return ""
}
