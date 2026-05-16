const cors = require("cors");
const express = require("express");
const helmet = require("helmet");
const morgan = require("morgan");
const env = require("./config/env");
const { closeDb, get, initDb } = require("./db/localDb");
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
const { scheduleSync } = require("./services/syncService");

const app = express();

app.use(helmet());
app.use(cors({ origin: env.clientOrigin, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(morgan("dev"));

app.get("/api/health", (req, res) => res.json({ ok: true }));
app.get("/api/health/db", async (req, res, next) => {
  try {
    await get("SELECT 1 AS ok");
    res.json({ ok: true, database: "postgres" });
  } catch (error) {
    next(error);
  }
});
app.use("/iclock", zktecoAdmsRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/mobile-punch", mobilePunchRoutes);
app.use("/api/master-data", masterDataRoutes);
app.use("/api/management", managementRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/sync", syncRoutes);

app.use((error, req, res, next) => {
  const status = error.code === "PERMISSION_DENIED" ? 403 : error.code === "INVALID_PATH" ? 400 : 500;
  res.status(status).json({
    message: error.message || "Unexpected server error.",
    code: error.code || "SERVER_ERROR"
  });
});

let server;

async function shutdown(signal) {
  console.log(`${signal} received. Shutting down.`);
  if (server) {
    server.close(async () => {
      await closeDb();
      process.exit(0);
    });
  } else {
    await closeDb();
    process.exit(0);
  }
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

initDb()
  .then(() => {
    scheduleSync();
    server = app.listen(env.port, () => {
      console.log(`Time Attendance API running on http://localhost:${env.port}`);
    });
  })
  .catch((error) => {
    console.error("Failed to start server", error);
    process.exit(1);
  });
