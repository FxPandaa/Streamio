/**
 * Streamio API - Configuration Management
 * Simplified configuration for account sync backend
 */

import { config as dotenvConfig } from "dotenv";
import { resolve } from "path";

// Load .env file
dotenvConfig({ path: resolve(process.cwd(), ".env") });

function getEnvVar(key: string, defaultValue?: string): string {
  const value = process.env[key] ?? defaultValue;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function getEnvVarInt(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (value === undefined) return defaultValue;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Environment variable ${key} must be a valid integer`);
  }
  return parsed;
}

export const config = {
  // Server Configuration
  server: {
    port: getEnvVarInt("PORT", 3000),
    nodeEnv: getEnvVar("NODE_ENV", "development"),
    isDevelopment: getEnvVar("NODE_ENV", "development") === "development",
    isProduction: getEnvVar("NODE_ENV", "development") === "production",
  },

  // JWT Configuration
  jwt: {
    secret: getEnvVar(
      "JWT_SECRET",
      "streamio-dev-secret-change-in-production-32chars",
    ),
    expiresIn: getEnvVar("JWT_EXPIRES_IN", "7d"),
    refreshExpiresIn: getEnvVar("JWT_REFRESH_EXPIRES_IN", "30d"),
  },

  // Database Configuration
  database: {
    path: getEnvVar("DATABASE_PATH", "./data/streamio.db"),
  },

  // CORS Configuration
  cors: {
    origins: getEnvVar(
      "CORS_ORIGINS",
      "http://localhost:1420,http://localhost:3000,tauri://localhost",
    ).split(","),
  },

  // Rate Limiting
  rateLimit: {
    windowMs: getEnvVarInt("RATE_LIMIT_WINDOW_MS", 15 * 60 * 1000),
    maxRequests: getEnvVarInt("RATE_LIMIT_MAX_REQUESTS", 100),
  },

  // Cache TTL (seconds)
  cache: {
    metadataTtl: getEnvVarInt("METADATA_CACHE_TTL", 86400), // 24 hours
  },

  // Cinemeta Configuration (for metadata proxy)
  cinemeta: {
    baseUrl: "https://v3-cinemeta.strem.io",
  },
} as const;

// Validate critical configuration on startup
export function validateConfig(): void {
  const errors: string[] = [];

  // JWT secret should be strong in production
  if (config.server.isProduction && config.jwt.secret.length < 32) {
    errors.push("JWT_SECRET must be at least 32 characters in production");
  }

  if (errors.length > 0) {
    console.error("Configuration errors:");
    errors.forEach((e) => console.error(`  - ${e}`));
    throw new Error("Invalid configuration");
  }
}

export default config;
