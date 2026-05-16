const { all, run } = require("../db/localDb");

async function getSettings() {
  const rows = await all("SELECT key, value FROM settings");
  return rows.reduce((acc, row) => {
    acc[row.key] = row.value;
    return acc;
  }, {});
}

async function saveSettings(settings) {
  const entries = Object.entries(settings).filter(([, value]) => value !== undefined);
  for (const [key, value] of entries) {
    await run(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      [key, String(value)]
    );
  }
  return getSettings();
}

module.exports = { getSettings, saveSettings };
