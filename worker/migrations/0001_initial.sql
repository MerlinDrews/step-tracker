-- One row per participant per calendar day. Re-logging the same day replaces steps (upsert).
CREATE TABLE IF NOT EXISTS steps (
  date TEXT NOT NULL,
  contact_id TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT '',
  steps INTEGER NOT NULL CHECK (steps >= 0 AND steps <= 100000),
  updated_at TEXT NOT NULL,
  updated_by_contact_id TEXT,
  updated_by_name TEXT,
  PRIMARY KEY (date, contact_id)
);

CREATE INDEX IF NOT EXISTS idx_steps_contact ON steps(contact_id);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  action TEXT NOT NULL,
  target_contact_id TEXT,
  target_date TEXT,
  old_steps INTEGER,
  new_steps INTEGER,
  actor_contact_id TEXT,
  actor_name TEXT
);
