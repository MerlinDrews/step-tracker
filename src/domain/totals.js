import { toLeaderboardContributors, withPublicNames } from './names.js';

/** Max ranks shown on the leaderboard. */
export const LEADERBOARD_LIMIT = 10;

/**
 * Collapse duplicate (date, contactId) rows — keeps the latest updated_at.
 * Defensive when imports or legacy Sheet data contain duplicates.
 */
export function dedupeDailyRows(rows) {
  /** @type {Map<string, typeof rows[0]>} */
  const byKey = new Map();
  /** @type {typeof rows} */
  const passthrough = [];
  for (const row of rows) {
    if (!row.date) {
      passthrough.push(row);
      continue;
    }
    const key = `${row.date}\0${String(row.contactId)}`;
    const existing = byKey.get(key);
    if (
      !existing ||
      String(row.updated_at || '') >= String(existing.updated_at || '')
    ) {
      byKey.set(key, row);
    }
  }
  return [...byKey.values(), ...passthrough];
}

/**
 * Aggregate all-time cumulative totals from daily rows.
 * Duplicate rows for the same person/day count once (latest updated_at wins).
 *
 * @param {Array<{date?: string, contactId: string|number, name?: string, email?: string, steps: number, updated_at?: string}>} rows
 * @returns {{ totalSteps: number, contributors: Array<{ contactId: string, name: string, email: string, steps: number }> }}
 */
export function aggregateTotals(rows) {
  const deduped = dedupeDailyRows(rows);
  /** @type {Map<string, { contactId: string, name: string, email: string, steps: number, firstName?: string, lastName?: string }>} */
  const byPerson = new Map();

  for (const row of deduped) {
    const id = String(row.contactId);
    const steps = Number(row.steps) || 0;
    const existing = byPerson.get(id);
    if (existing) {
      existing.steps += steps;
      if (row.name) existing.name = row.name;
      if (row.email) existing.email = row.email;
      if (row.firstName) existing.firstName = row.firstName;
      if (row.lastName) existing.lastName = row.lastName;
    } else {
      byPerson.set(id, {
        contactId: id,
        name: row.name || row.email || `Member ${id}`,
        email: row.email || '',
        steps,
        ...(row.firstName ? { firstName: row.firstName } : {}),
        ...(row.lastName ? { lastName: row.lastName } : {}),
      });
    }
  }

  const contributors = [...byPerson.values()].sort((a, b) => {
    if (b.steps !== a.steps) return b.steps - a.steps;
    return a.name.localeCompare(b.name);
  });

  const totalSteps = contributors.reduce((sum, c) => sum + c.steps, 0);

  return { totalSteps, contributors };
}

/**
 * All-time step total for one participant.
 */
export function personalTotal(rows, contactId) {
  const id = String(contactId);
  return aggregateTotals(rows.filter((r) => String(r.contactId) === id)).totalSteps;
}

/**
 * Top N contributors by cumulative steps (default {@link LEADERBOARD_LIMIT}).
 */
export function topContributors(contributors, limit = LEADERBOARD_LIMIT) {
  return contributors.slice(0, Math.max(0, limit));
}

/**
 * Leaderboard payload: club total, top N ranks, and full participant count.
 */
export function leaderboardTotals(rows, limit = LEADERBOARD_LIMIT) {
  const full = aggregateTotals(rows);
  const named = withPublicNames(full.contributors);
  const contributors = toLeaderboardContributors(topContributors(named, limit));
  return {
    totalSteps: full.totalSteps,
    contributors,
    participantCount: full.contributors.length,
    leaderboardLimit: limit,
  };
}

/**
 * Find steps for a contact on a given date, or null.
 */
export function findStepsForDate(rows, contactId, dateKey) {
  const id = String(contactId);
  const row = rows.find((r) => r.date === dateKey && String(r.contactId) === id);
  return row ? Number(row.steps) : null;
}

/** @deprecated use findStepsForDate */
export const findTodaySteps = findStepsForDate;

/**
 * Map of date -> steps for one contact (for calendar markers).
 * @returns {Record<string, number>}
 */
export function historyForContact(rows, contactId) {
  const id = String(contactId);
  /** @type {Record<string, number>} */
  const history = {};
  for (const row of rows) {
    if (String(row.contactId) === id) {
      history[row.date] = Number(row.steps) || 0;
    }
  }
  return history;
}
