package config

import (
	"fmt"
	"os"
	"strconv"
)

type Config struct {
	Port       int
	DBHost     string
	DBPort     int
	DBUser     string
	DBPassword string
	DBName     string
	DBSSLMode  string
	JWTSecret  string
	CORSOrigin string
	FileStorageRoot string
	MaxUploadBytes  int64
}

func Load() *Config {
	port := getEnvInt("PORT", 0)
	if port == 0 {
		port = getEnvInt("BACKEND_PORT", 8080)
	}
	return &Config{
		Port:       port,
		DBHost:     getEnv("DB_HOST", "localhost"),
		DBPort:     getEnvInt("DB_PORT", 5432),
		DBUser:     getEnv("DB_USER", "justspace"),
		DBPassword: getEnv("DB_PASSWORD", "justspace"),
		DBName:     getEnv("DB_NAME", "justspace"),
		DBSSLMode:  getEnv("DB_SSLMODE", "disable"),
		JWTSecret:  getEnv("JWT_SECRET", "change-me-in-production"),
		CORSOrigin: getEnv("CORS_ORIGIN", "http://localhost:3000"),
		FileStorageRoot: getEnv("FILE_STORAGE_ROOT", "/data/uploads"),
		MaxUploadBytes:  getEnvInt64("MAX_UPLOAD_BYTES", 50*1024*1024),
	}
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
