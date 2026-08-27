import { withPublicNames } from '../../src/domain/names.js';

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

function mapContributor(r) {
  return {
    contactId: String(r.contact_id),
    name: String(r.name || r.email || `Member ${r.contact_id}`),
    firstName: String(r.first_name || ''),
    lastName: String(r.last_name || ''),
    email: String(r.email || ''),
    steps: Number(r.steps) || 0,
  };
}

/**
 * Distinct participants with latest known name parts (for display / disambiguation).
 */
export async function getContactNameParts(db) {
  const { results } = await db
    .prepare(
      `SELECT contact_id,
              MAX(email) AS email,
              MAX(name) AS name,
              MAX(first_name) AS first_name,
              MAX(last_name) AS last_name
       FROM steps
       GROUP BY contact_id`,
    )
    .all();
  return (results || []).map((r) => ({
    contactId: String(r.contact_id),
    email: String(r.email || ''),
    name: String(r.name || ''),
    firstName: String(r.first_name || ''),
    lastName: String(r.last_name || ''),
  }));
}

/**
 * @returns {Promise<{ totalSteps: number, contributors: Array<object>, participantCount: number, leaderboardLimit: number }>}
 */
export async function getLeaderboardTotals(db, limit) {
  const totalSteps = await getClubTotal(db);
  const all = withPublicNames(await getAllContributors(db));
  return {
    totalSteps,
    contributors: all.slice(0, Math.max(0, limit)),
    participantCount: all.length,
    leaderboardLimit: limit,
  };
}

export async function getAllContributors(db) {
  const { results } = await db
    .prepare(
      `SELECT contact_id, email, name, first_name, last_name, SUM(steps) AS steps
       FROM steps
       GROUP BY contact_id
       ORDER BY steps DESC, name ASC`,
    )
    .all();
  return (results || []).map(mapContributor);
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
      `INSERT INTO steps (date, contact_id, email, name, first_name, last_name, steps, updated_at, updated_by_contact_id, updated_by_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(date, contact_id) DO UPDATE SET
         email = excluded.email,
         name = excluded.name,
         first_name = excluded.first_name,
         last_name = excluded.last_name,
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
      entry.firstName || '',
      entry.lastName || '',
      entry.steps,
      entry.updated_at,
      entry.updated_by_contact_id || null,
      entry.updated_by_name || null,
    )
    .run();
}

/**
 * Rewrite public `name` for every row of each contact (keeps disambiguation in sync).
 * @param {D1Database} db
 * @param {Map<string, string>} displayByContactId
 */
export async function updateContactDisplayNames(db, displayByContactId) {
  const stmts = [];
  for (const [contactId, name] of displayByContactId.entries()) {
    stmts.push(
      db.prepare('UPDATE steps SET name = ? WHERE contact_id = ?').bind(name, contactId),
    );
  }
  if (stmts.length) await db.batch(stmts);
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
