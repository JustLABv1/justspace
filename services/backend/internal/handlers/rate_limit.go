package handlers

import (
	"net"
	"net/http"
	"sync"
	"time"
)

// authRateLimiter deliberately keys on the client IP and keeps a small,
// bounded time window. It is an application-level backstop; production should
// additionally enforce the same limit at the reverse proxy.
type authRateLimiter struct {
	mu       sync.Mutex
	attempts map[string][]time.Time
}

func newAuthRateLimiter() *authRateLimiter {
	return &authRateLimiter{attempts: make(map[string][]time.Time)}
}

func (l *authRateLimiter) allow(r *http.Request) bool {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	now := time.Now()
	cutoff := now.Add(-time.Minute)
	l.mu.Lock()
	defer l.mu.Unlock()
	recent := l.attempts[host][:0]
	for _, timestamp := range l.attempts[host] {
		if timestamp.After(cutoff) {
			recent = append(recent, timestamp)
		}
	}
	if len(recent) >= 10 {
		l.attempts[host] = recent
		return false
	}
	l.attempts[host] = append(recent, now)
	return true
}
