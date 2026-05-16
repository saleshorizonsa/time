const env = require("./config/env");
const { createApp, ensureInitialized } = require("./app");
const { closeDb } = require("./db/localDb");
const { scheduleSync } = require("./services/syncService");

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
