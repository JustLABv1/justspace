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
}

func Load() *Config {
	return &Config{
		Port:       getEnvInt("PORT", 8080),
		DBHost:     getEnv("DB_HOST", "localhost"),
		DBPort:     getEnvInt("DB_PORT", 5432),
		DBUser:     getEnv("DB_USER", "justspace"),
		DBPassword: getEnv("DB_PASSWORD", "justspace"),
		DBName:     getEnv("DB_NAME", "justspace"),
		DBSSLMode:  getEnv("DB_SSLMODE", "disable"),
		JWTSecret:  getEnv("JWT_SECRET", "change-me-in-production"),
		CORSOrigin: getEnv("CORS_ORIGIN", "http://localhost:3000"),
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
