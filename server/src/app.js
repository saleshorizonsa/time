const cors = require("cors");
const express = require("express");
const helmet = require("helmet");
const morgan = require("morgan");
const env = require("./config/env");
const { get, initDb } = require("./db/localDb");
const authRoutes = require("./routes/authRoutes");
const attendanceRoutes = require("./routes/attendanceRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const mobilePunchRoutes = require("./routes/mobilePunchRoutes");
const masterDataRoutes = require("./routes/masterDataRoutes");
const managementRoutes = require("./routes/managementRoutes");
const reportRoutes = require("./routes/reportRoutes");
const settingsRoutes = require("./routes/settingsRoutes");
const syncRoutes = require("./routes/syncRoutes");
const zktecoAdmsRoutes = require("./routes/zktecoAdmsRoutes");

let initPromise;

function ensureInitialized() {
  if (!initPromise) {
    initPromise = initDb();
  }
  return initPromise;
}

function statusForError(error) {
  if (error.code === "PERMISSION_DENIED") return 403;
  if (error.code === "INVALID_PATH") return 400;
  if (error.code === "SUPABASE_AUTH_FAILED") return 401;
  if (error.code === "SUPABASE_AUTH_NOT_CONFIGURED") return 503;
  if (error.code === "23505") return 409;
  if (error.code === "28P01" || error.code === "3D000" || error.code === "ENOTFOUND" || error.code === "ECONNREFUSED") {
    return 503;
  }
  return 500;
}

function publicErrorMessage(error, status) {
  if (status === 503 && (error.code === "28P01" || error.code === "3D000" || error.code === "ENOTFOUND" || error.code === "ECONNREFUSED")) {
    return "Database is not reachable. Check Supabase database environment variables.";
  }
  return error.message || "Unexpected server error.";
}

function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.clientOrigin === "*" ? true : env.clientOrigin, credentials: true }));
  app.use(express.json({ limit: "1mb" }));
  app.use(morgan(env.nodeEnv === "production" ? "combined" : "dev"));

  app.get("/api/health", (req, res) => res.json({ ok: true }));
  app.get("/api/health/db", async (req, res, next) => {
    try {
      await ensureInitialized();
      await get("SELECT 1 AS ok");
      res.json({ ok: true, database: "postgres" });
    } catch (error) {
      next(error);
    }
  });

  app.use(async (req, res, next) => {
    try {
      await ensureInitialized();
      next();
    } catch (error) {
      next(error);
    }
  });

  app.use("/iclock", zktecoAdmsRoutes);
  app.use("/api/iclock", zktecoAdmsRoutes);
  app.use("/api/auth", authRoutes);
  app.use("/api/attendance", attendanceRoutes);
  app.use("/api/dashboard", dashboardRoutes);
  app.use("/api/mobile-punch", mobilePunchRoutes);
  app.use("/api/master-data", masterDataRoutes);
  app.use("/api/management", managementRoutes);
  app.use("/api/reports", reportRoutes);
  app.use("/api/settings", settingsRoutes);
  app.use("/api/sync", syncRoutes);

  app.use((req, res) => {
    res.status(404).json({ message: "Route not found." });
  });

  app.use((error, req, res, next) => {
    const status = statusForError(error);
    res.status(status).json({
      message: publicErrorMessage(error, status),
      code: error.code || "SERVER_ERROR"
    });
  });

  return app;
}

module.exports = { createApp, ensureInitialized };
