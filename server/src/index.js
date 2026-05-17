const env = require("./config/env");
const { createApp, ensureInitialized } = require("./app");
const { closeDb } = require("./db/localDb");
const { scheduleSync } = require("./services/syncService");

if (env.isProduction) {
  const missing = [];
  if (!process.env.JWT_SECRET) missing.push("JWT_SECRET");
  if (!process.env.ADMIN_EMAIL) missing.push("ADMIN_EMAIL");
  if (!process.env.ADMIN_PASSWORD) missing.push("ADMIN_PASSWORD");
  if (!process.env.DATABASE_URL && !process.env.SUPABASE_DB_PASSWORD) {
    missing.push("DATABASE_URL (or SUPABASE_DB_PASSWORD + SUPABASE_PROJECT_REF)");
  }
  if (missing.length > 0) {
    console.error("[startup] Missing required env vars in production:", missing.join(", "));
    process.exit(1);
  }
}

const app = createApp();
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

ensureInitialized()
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
