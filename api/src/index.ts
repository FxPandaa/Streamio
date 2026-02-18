/**
 * Vreamio API - Main Application Entry Point
 *
 * A lightweight account sync backend for cross-platform streaming
 * Serves Windows, macOS, Linux, Android, iOS, Android TV, and Apple TV
 *
 * ARCHITECTURE:
 * - This backend handles: Authentication, account sync, library, watch history
 * - The apps handle: Scraping, debrid communication, video playback
 * - Users enter debrid keys in app settings (stored locally or synced encrypted)
 */

import express, { Express, Request, Response } from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import config, { validateConfig } from "./config/index.js";
import {
  initDatabase,
  closeDatabase,
  cleanupExpiredCache,
} from "./database/index.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import {
  authRoutes,
  userRoutes,
  libraryRoutes,
  historyRoutes,
  metadataRoutes,
  syncRoutes,
  profileRoutes,
  billingRoutes,
  internalRoutes,
} from "./routes/index.js";
import { clearExpiredMetadataCache } from "./services/metadata/index.js";
import {
  startProvisioningWorker,
  stopProvisioningWorker,
} from "./services/provisioning/worker.js";

// ============================================================================
// APPLICATION SETUP
// ============================================================================

const app: Express = express();

/**
 * Initialize the application
 */
async function initialize(): Promise<void> {
  console.log("🚀 Starting Vreamio API...");
  console.log(`📍 Environment: ${config.server.nodeEnv}`);

  // Validate configuration
  validateConfig();
  console.log("✅ Configuration validated");

  // Initialize database
  initDatabase();
  console.log("✅ Database initialized");
}

// ============================================================================
// MIDDLEWARE
// ============================================================================

// CORS configuration - allow Tauri apps and web clients
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, Tauri)
      if (!origin) {
        callback(null, true);
        return;
      }

      // Check if origin is allowed
      if (
        config.cors.origins.includes(origin) ||
        origin.startsWith("tauri://") ||
        origin.startsWith("http://localhost") ||
        origin.startsWith("https://localhost")
      ) {
        callback(null, true);
      } else if (config.server.isDevelopment) {
        // Allow all origins in development
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

// Parse JSON bodies
app.use(express.json({ limit: "1mb" }));

// Parse URL-encoded bodies
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// Rate limiting
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  message: {
    success: false,
    error: "Too many requests, please try again later",
    code: "RATE_LIMIT_EXCEEDED",
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Skip rate limiting in development
  skip: () => config.server.isDevelopment,
});

app.use(limiter);

// Request logging in development
if (config.server.isDevelopment) {
  app.use((req: Request, _res: Response, next) => {
    console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
    next();
  });
}

// ============================================================================
// ROUTES
// ============================================================================

// Health check
app.get("/health", (_req: Request, res: Response) => {
  res.json({
    success: true,
    status: "healthy",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
  });
});

// API info
app.get("/", (_req: Request, res: Response) => {
  res.json({
    name: "Vreamio API",
    version: "1.0.0",
    description: "Account sync backend for cross-platform streaming",
    endpoints: {
      auth: "/auth",
      user: "/user",
      library: "/user/library",
      history: "/user/history",
      metadata: "/metadata",
      sync: "/sync",
      billing: "/billing",
      internal: "/internal",
    },
  });
});

// Mount routes
app.use("/auth", authRoutes);
app.use("/user", userRoutes);
app.use("/user/library", libraryRoutes);
app.use("/user/history", historyRoutes);
app.use("/metadata", metadataRoutes);
app.use("/sync", syncRoutes);
app.use("/profiles", profileRoutes);
app.use("/billing", billingRoutes);
app.use("/internal", internalRoutes);

// 404 handler
app.use(notFoundHandler);

// Global error handler (must be last)
app.use(errorHandler);

// ============================================================================
// BACKGROUND TASKS
// ============================================================================

/**
 * Periodic cache cleanup
 * Runs every hour to remove expired cache entries
 */
function startCacheCleanupJob(): NodeJS.Timeout {
  const interval = 60 * 60 * 1000; // 1 hour

  return setInterval(() => {
    console.log("🧹 Running cache cleanup...");
    try {
      cleanupExpiredCache();
      clearExpiredMetadataCache();
    } catch (error) {
      console.error("Cache cleanup error:", error);
    }
  }, interval);
}

// ============================================================================
// SERVER STARTUP
// ============================================================================

let cleanupInterval: NodeJS.Timeout;

async function startServer(): Promise<void> {
  try {
    await initialize();

    const server = app.listen(config.server.port, () => {
      console.log(`
╔════════════════════════════════════════════════════════════════╗
║                    🎬 VREAMIO API v1.0.0                       ║
╠════════════════════════════════════════════════════════════════╣
║  Server running at: http://localhost:${config.server.port.toString().padEnd(25)}║
║  Environment: ${config.server.nodeEnv.padEnd(43)}║
╠════════════════════════════════════════════════════════════════╣
║  Endpoints:                                                    ║
║    POST /auth/register     - Create account                    ║
║    POST /auth/login        - Login                             ║
║    GET  /user/profile      - Get user profile                  ║
║    GET  /user/library      - Synced library                    ║
║    GET  /user/history      - Watch history                     ║
║    GET  /metadata/search   - Search movies/series              ║
║    GET  /billing/status    - Subscription status               ║
║    POST /billing/checkout  - Start payment                     ║
║    GET  /internal/health   - Operator health check             ║
╠════════════════════════════════════════════════════════════════╣
║  NOTE: Scraping & debrid handled in apps, not server           ║
╚════════════════════════════════════════════════════════════════╝
      `);
    });

    // Start background jobs
    cleanupInterval = startCacheCleanupJob();

    // Start the billing provisioning worker
    startProvisioningWorker();

    // Graceful shutdown
    const shutdown = async () => {
      console.log("\n🛑 Shutting down gracefully...");

      clearInterval(cleanupInterval);
      stopProvisioningWorker();

      server.close(() => {
        closeDatabase();
        console.log("👋 Goodbye!");
        process.exit(0);
      });

      // Force exit after 10 seconds
      setTimeout(() => {
        console.error("❌ Forced shutdown after timeout");
        process.exit(1);
      }, 10000);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
}

// Start the server
startServer();

export default app;
