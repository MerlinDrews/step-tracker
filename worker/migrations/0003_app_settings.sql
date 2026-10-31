-- Global app flags (e.g. leaderboard visibility for all visitors).
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
