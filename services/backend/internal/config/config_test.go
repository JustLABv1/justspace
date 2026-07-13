package config

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"math/big"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestCustomCAPoolAcceptsPEM(t *testing.T) {
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	template := x509.Certificate{
		SerialNumber:          big.NewInt(1),
		Subject:               pkix.Name{CommonName: "JustSpace test CA"},
		NotBefore:             time.Now().Add(-time.Hour),
		NotAfter:              time.Now().Add(time.Hour),
		IsCA:                  true,
		BasicConstraintsValid: true,
		KeyUsage:              x509.KeyUsageCertSign,
	}
	der, err := x509.CreateCertificate(rand.Reader, &template, &template, &key.PublicKey, key)
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(t.TempDir(), "ca.pem")
	if err := os.WriteFile(path, pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der}), 0o600); err != nil {
		t.Fatal(err)
	}

	pool, err := (&Config{CustomCACertFile: path}).CustomCAPool()
	if err != nil {
		t.Fatalf("CustomCAPool() error = %v", err)
	}
	if pool == nil {
		t.Fatal("CustomCAPool() returned nil pool")
	}
}

func TestCustomCAPoolRejectsInvalidPEM(t *testing.T) {
	path := filepath.Join(t.TempDir(), "ca.pem")
	if err := os.WriteFile(path, []byte("not a certificate"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := (&Config{CustomCACertFile: path}).CustomCAPool(); err == nil {
		t.Fatal("CustomCAPool() accepted invalid PEM")
	}
}

func TestLoadAcceptsMigrationModes(t *testing.T) {
	t.Setenv("APP_ENV", "development")
	t.Setenv("MIGRATIONS_MODE", "only")
	if got := Load().MigrationsMode; got != "only" {
		t.Fatalf("MigrationsMode = %q, want only", got)
	}
}

func TestLoadRejectsUnknownMigrationMode(t *testing.T) {
	t.Setenv("APP_ENV", "development")
	t.Setenv("MIGRATIONS_MODE", "sometimes")
	defer func() {
		if recover() == nil {
			t.Fatal("Load() did not panic for an invalid migration mode")
		}
	}()
	Load()
}
