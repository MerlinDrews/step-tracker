/**
 * @typedef {import('@cloudflare/workers-types').D1Database} D1Database
 */

export async function getClubTotal(db) {
  const row = await db
    .prepare('SELECT COALESCE(SUM(steps), 0) AS total FROM steps')
    .first();
  return Number(row?.total) || 0;
}

export async function getPersonalTotal(db, contactId) {
  const row = await db
    .prepare('SELECT COALESCE(SUM(steps), 0) AS total FROM steps WHERE contact_id = ?')
    .bind(String(contactId))
    .first();
  return Number(row?.total) || 0;
}

/**
 * @returns {Promise<{ totalSteps: number, contributors: Array<object>, participantCount: number, leaderboardLimit: number }>}
 */
export async function getLeaderboardTotals(db, limit) {
  const totalSteps = await getClubTotal(db);
  const countRow = await db
    .prepare('SELECT COUNT(DISTINCT contact_id) AS n FROM steps')
    .first();
  const participantCount = Number(countRow?.n) || 0;

  const { results } = await db
    .prepare(
      `SELECT contact_id, email, name, SUM(steps) AS steps
       FROM steps
       GROUP BY contact_id
       ORDER BY steps DESC, name ASC
       LIMIT ?`,
    )
    .bind(limit)
    .all();

  const contributors = (results || []).map((r) => ({
    contactId: String(r.contact_id),
    email: String(r.email || ''),
    name: String(r.name || r.email || `Member ${r.contact_id}`),
    steps: Number(r.steps) || 0,
  }));

  return {
    totalSteps,
    contributors,
    participantCount,
    leaderboardLimit: limit,
  };
}

export async function getAllContributors(db) {
  const { results } = await db
    .prepare(
      `SELECT contact_id, email, name, SUM(steps) AS steps
       FROM steps
       GROUP BY contact_id
       ORDER BY steps DESC, name ASC`,
    )
    .all();
  return (results || []).map((r) => ({
    contactId: String(r.contact_id),
    email: String(r.email || ''),
    name: String(r.name || r.email || `Member ${r.contact_id}`),
    steps: Number(r.steps) || 0,
  }));
}

export async function getDaySteps(db, contactId, date) {
  const row = await db
    .prepare('SELECT steps FROM steps WHERE date = ? AND contact_id = ?')
    .bind(date, String(contactId))
    .first();
  return row ? Number(row.steps) : null;
}

export async function getHistoryForContact(db, contactId) {
  const { results } = await db
    .prepare('SELECT date, steps FROM steps WHERE contact_id = ? ORDER BY date')
    .bind(String(contactId))
    .all();
  /** @type {Record<string, number>} */
  const history = {};
  for (const row of results || []) {
    history[String(row.date)] = Number(row.steps) || 0;
  }
  return history;
}

/**
 * Upsert one day — PRIMARY KEY (date, contact_id) ensures re-logging replaces, not adds.
 */
export async function upsertDaySteps(db, entry) {
  await db
    .prepare(
      `INSERT INTO steps (date, contact_id, email, name, steps, updated_at, updated_by_contact_id, updated_by_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(date, contact_id) DO UPDATE SET
         email = excluded.email,
         name = excluded.name,
         steps = excluded.steps,
         updated_at = excluded.updated_at,
         updated_by_contact_id = excluded.updated_by_contact_id,
         updated_by_name = excluded.updated_by_name`,
    )
    .bind(
      entry.date,
      String(entry.contactId),
      entry.email || '',
      entry.name || '',
      entry.steps,
      entry.updated_at,
      entry.updated_by_contact_id || null,
      entry.updated_by_name || null,
    )
    .run();
}

export async function writeAuditLog(db, row) {
  await db
    .prepare(
      `INSERT INTO audit_log (at, action, target_contact_id, target_date, old_steps, new_steps, actor_contact_id, actor_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      row.at,
      row.action,
      row.target_contact_id,
      row.target_date,
      row.old_steps,
      row.new_steps,
      row.actor_contact_id,
      row.actor_name,
    )
    .run();
}
