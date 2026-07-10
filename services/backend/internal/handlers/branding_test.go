package handlers

import (
	"testing"
	"time"
)

func TestBrandingLogoSize(t *testing.T) {
	tests := []struct {
		input string
		want  int
	}{
		{input: "32", want: 32},
		{input: "180", want: 180},
		{input: "192", want: 192},
		{input: "512", want: 512},
		{input: "256", want: 512},
		{input: "", want: 512},
	}
	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			if got := brandingLogoSize(tt.input); got != tt.want {
				t.Fatalf("brandingLogoSize(%q) = %d, want %d", tt.input, got, tt.want)
			}
		})
	}
}

func TestURLQueryVersion(t *testing.T) {
	if got := urlQueryVersion(nil); got != "default" {
		t.Fatalf("urlQueryVersion(nil) = %q, want default", got)
	}
	updated := time.Unix(123, 456)
	if got := urlQueryVersion(&updated); got != "123000000456" {
		t.Fatalf("urlQueryVersion(time) = %q", got)
	}
}
