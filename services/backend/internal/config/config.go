package config

import (
	"fmt"
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
	}
	if cfg.Production {
		if len(cfg.JWTSecret) < 32 || cfg.JWTSecret == "change-me-in-production" {
			panic("JWT_SECRET must be a unique value of at least 32 characters in production")
		}
		if cfg.OIDCEncryptionKey == "" {
			panic("OIDC_ENCRYPTION_KEY must be configured in production")
		}
		if cfg.DBPassword == "justspace" || cfg.DBSSLMode == "disable" {
			panic("production requires a non-default DB_PASSWORD and DB_SSLMODE other than disable")
		}
	}
	return cfg
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
