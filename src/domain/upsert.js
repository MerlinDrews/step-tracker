/**
 * Upsert one person's steps for a calendar date.
 * Does not mutate the input array.
 *
 * @param {Array<{date: string, contactId: string|number, email?: string, name?: string, steps: number, updated_at?: string}>} rows
 * @param {{ date: string, contactId: string|number, email?: string, name?: string, steps: number, updated_at?: string }} entry
 * @returns {typeof rows}
 */
export function upsertDailySteps(rows, entry) {
  const contactId = String(entry.contactId);
  const date = entry.date;
  const updated_at = entry.updated_at || new Date().toISOString();
  const next = rows.map((r) => ({ ...r }));

  const idx = next.findIndex(
    (r) => r.date === date && String(r.contactId) === contactId,
  );

  const row = {
    date,
    contactId: entry.contactId,
    email: entry.email ?? '',
    name: entry.name ?? '',
    steps: entry.steps,
    updated_at,
  };

  if (idx >= 0) {
    next[idx] = {
      ...next[idx],
      ...row,
      email: entry.email ?? next[idx].email,
      name: entry.name ?? next[idx].name,
    };
  } else {
    next.push(row);
  }

  return next;
}
