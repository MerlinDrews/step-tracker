/**
 * Aggregate all-time cumulative totals from daily rows.
 *
 * @param {Array<{contactId: string|number, name?: string, email?: string, steps: number}>} rows
 * @returns {{ totalSteps: number, contributors: Array<{ contactId: string, name: string, email: string, steps: number }> }}
 */
export function aggregateTotals(rows) {
  /** @type {Map<string, { contactId: string, name: string, email: string, steps: number }>} */
  const byPerson = new Map();

  for (const row of rows) {
    const id = String(row.contactId);
    const steps = Number(row.steps) || 0;
    const existing = byPerson.get(id);
    if (existing) {
      existing.steps += steps;
      if (row.name) existing.name = row.name;
      if (row.email) existing.email = row.email;
    } else {
      byPerson.set(id, {
        contactId: id,
        name: row.name || row.email || `Member ${id}`,
        email: row.email || '',
        steps,
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
