package main

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
)

type fakePinger struct{ err error }

func (p fakePinger) Ping(context.Context) error { return p.err }

func TestHealthHandler(t *testing.T) {
	response := httptest.NewRecorder()
	healthHandler(response, httptest.NewRequest(http.MethodGet, "/healthz", nil))
	if response.Code != http.StatusOK || response.Body.String() != `{"status":"ok"}` {
		t.Fatalf("health response = %d %q", response.Code, response.Body.String())
	}
}

func TestReadyHandler(t *testing.T) {
	tests := []struct {
		name string
		err  error
		want int
	}{
		{name: "database is available", want: http.StatusOK},
		{name: "database is unavailable", err: errors.New("unavailable"), want: http.StatusServiceUnavailable},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			response := httptest.NewRecorder()
			readyHandler(fakePinger{err: test.err})(response, httptest.NewRequest(http.MethodGet, "/readyz", nil))
			if response.Code != test.want {
				t.Fatalf("status = %d, want %d", response.Code, test.want)
			}
		})
	}
}
