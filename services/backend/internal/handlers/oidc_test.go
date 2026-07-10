package handlers

import (
	"strings"
	"testing"

	"github.com/justlabv1/justspace/backend/internal/models"
)

func TestOIDCSecretRoundTrip(t *testing.T) {
	h := &AuthHandler{jwtSecret: "jwt-secret", oidcEncryptionKey: "a-dedicated-oidc-key"}
	encoded, err := h.encryptSecret("client-secret-value")
	if err != nil {
		t.Fatalf("encryptSecret() error = %v", err)
	}
	if encoded == "client-secret-value" || encoded == "" {
		t.Fatal("secret was not encrypted")
	}
	decoded, err := h.decryptSecret(encoded)
	if err != nil {
		t.Fatalf("decryptSecret() error = %v", err)
	}
	if decoded != "client-secret-value" {
		t.Fatalf("decryptSecret() = %q, want original value", decoded)
	}
	if _, err := h.decryptSecret(encoded[:len(encoded)-2] + "xx"); err == nil {
		t.Fatal("decryptSecret() accepted tampered ciphertext")
	}
}

func TestPKCEChallenge(t *testing.T) {
	challenge := pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")
	if challenge != "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM" {
		t.Fatalf("pkceChallenge() = %q", challenge)
	}
}

func TestValidateOIDCProviderRequest(t *testing.T) {
	valid := struct {
		slug   string
		name   string
		client string
	}{"company-sso", "Company SSO", "client"}
	if err := validateOIDCProviderRequest(structToProviderRequest(valid, "secret"), true); err != nil {
		t.Fatalf("valid provider rejected: %v", err)
	}
	if err := validateOIDCProviderRequest(structToProviderRequest(struct {
		slug   string
		name   string
		client string
	}{"Bad Slug", "Company SSO", "client"}, "secret"), true); err == nil {
		t.Fatal("invalid slug was accepted")
	}
	if err := validateOIDCProviderRequest(structToProviderRequest(valid, ""), true); err == nil {
		t.Fatal("new provider without secret was accepted")
	}
	if strings.TrimSpace(" company-sso ") != "company-sso" {
		t.Fatal("unexpected test setup")
	}
}

func structToProviderRequest(value struct {
	slug   string
	name   string
	client string
}, secret string) models.OIDCProviderRequest {
	return models.OIDCProviderRequest{Slug: value.slug, Name: value.name, ClientID: value.client, ClientSecret: secret}
}
