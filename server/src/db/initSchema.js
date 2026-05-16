const { closeDb, initDb } = require("./localDb");

initDb()
  .then(async () => {
    console.log("Database schema is ready.");
    await closeDb();
  })
  .catch(async (error) => {
    console.error(error.message);
    try {
      await closeDb();
    } catch {
      // Ignore shutdown errors after a failed connection.
    }
    process.exit(1);
  });
