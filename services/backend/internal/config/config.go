package config

import (
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"strings"
)

type Config struct {
	Port              int
	DBHost            string
	DBPort            int
	DBUser            string
	DBPassword        string
	DBName            string
	DBSSLMode         string
	JWTSecret         string
	OIDCEncryptionKey string
	CORSOrigin        string
	FileStorageRoot   string
	MaxUploadBytes    int64
	Production        bool
	MigrationsMode    string
	CustomCACertFile  string
}

func Load() *Config {
	port := getEnvInt("PORT", 0)
	if port == 0 {
		port = getEnvInt("BACKEND_PORT", 8080)
	}
	cfg := &Config{
		Port:              port,
		DBHost:            getEnv("DB_HOST", "localhost"),
		DBPort:            getEnvInt("DB_PORT", 5432),
		DBUser:            getEnv("DB_USER", "justspace"),
		DBPassword:        getEnv("DB_PASSWORD", "justspace"),
		DBName:            getEnv("DB_NAME", "justspace"),
		DBSSLMode:         getEnv("DB_SSLMODE", "disable"),
		JWTSecret:         getEnv("JWT_SECRET", "change-me-in-production"),
		OIDCEncryptionKey: getEnv("OIDC_ENCRYPTION_KEY", ""),
		CORSOrigin:        getEnv("CORS_ORIGIN", "http://localhost:3000"),
		FileStorageRoot:   getEnv("FILE_STORAGE_ROOT", "/data/uploads"),
		MaxUploadBytes:    getEnvInt64("MAX_UPLOAD_BYTES", 50*1024*1024),
		Production:        strings.EqualFold(getEnv("APP_ENV", "development"), "production"),
		MigrationsMode:    strings.ToLower(getEnv("MIGRATIONS_MODE", "auto")),
		CustomCACertFile:  getEnv("CUSTOM_CA_CERT_FILE", ""),
	}
	if cfg.MigrationsMode != "auto" && cfg.MigrationsMode != "only" && cfg.MigrationsMode != "skip" {
		panic("MIGRATIONS_MODE must be one of auto, only, or skip")
	}
	if cfg.Production {
		if len(cfg.JWTSecret) < 32 || cfg.JWTSecret == "change-me-in-production" {
			panic("JWT_SECRET must be a unique value of at least 32 characters in production")
		}
		if cfg.OIDCEncryptionKey == "" {
			panic("OIDC_ENCRYPTION_KEY must be configured in production")
		}
		if cfg.DBPassword == "justspace" {
			panic("production requires a non-default DB_PASSWORD")
		}
	}
	return cfg
}

// CustomCAPool returns the system certificate pool extended with the configured
// PEM bundle. Keeping the system roots is important for installations that use
// both public endpoints and endpoints signed by an internal CA.
func (c *Config) CustomCAPool() (*x509.CertPool, error) {
	if c.CustomCACertFile == "" {
		return nil, nil
	}
	pem, err := os.ReadFile(c.CustomCACertFile)
	if err != nil {
		return nil, fmt.Errorf("read custom CA certificate %s: %w", c.CustomCACertFile, err)
	}
	pool, err := x509.SystemCertPool()
	if err != nil || pool == nil {
		pool = x509.NewCertPool()
	}
	if !pool.AppendCertsFromPEM(pem) {
		return nil, fmt.Errorf("custom CA certificate %s does not contain a valid PEM certificate", c.CustomCACertFile)
	}
	return pool, nil
}

// ConfigureDefaultHTTPClient makes the custom CA available to OIDC discovery
// and token exchanges, which use Go's default HTTP client.
func (c *Config) ConfigureDefaultHTTPClient() error {
	pool, err := c.CustomCAPool()
	if err != nil || pool == nil {
		return err
	}
	transport, ok := http.DefaultTransport.(*http.Transport)
	if !ok {
		return fmt.Errorf("default HTTP transport has unexpected type %T", http.DefaultTransport)
	}
	configured := transport.Clone()
	if configured.TLSClientConfig == nil {
		configured.TLSClientConfig = &tls.Config{}
	} else {
		configured.TLSClientConfig = configured.TLSClientConfig.Clone()
	}
	configured.TLSClientConfig.RootCAs = pool
	configured.TLSClientConfig.MinVersion = tls.VersionTLS12
	http.DefaultTransport = configured
	http.DefaultClient.Transport = configured
	return nil
}

func (c *Config) DSN() string {
	return fmt.Sprintf(
		"postgres://%s:%s@%s:%d/%s?sslmode=%s",
		c.DBUser, c.DBPassword, c.DBHost, c.DBPort, c.DBName, c.DBSSLMode,
	)
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func getEnvInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if i, err := strconv.Atoi(v); err == nil {
			return i
		}
	}
	return fallback
}

func getEnvInt64(key string, fallback int64) int64 {
	if v := os.Getenv(key); v != "" {
		if i, err := strconv.ParseInt(v, 10, 64); err == nil {
			return i
		}
	}
	return fallback
}
