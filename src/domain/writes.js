/** Shown when an admin has closed step logging (read-only challenge). */
export const STEPS_WRITES_DISABLED_MESSAGE =
  'Step logging is closed. Totals and the leaderboard are still available to view.';

/**
 * Parse env / config flags. Unset → defaultValue (true keeps local/tests writable).
 * @param {unknown} value
 * @param {boolean} [defaultValue=true]
 */
export function parseStepsWritesEnabled(value, defaultValue = true) {
  if (value === undefined || value === null || value === '') return defaultValue;
  if (typeof value === 'boolean') return value;
  const s = String(value).trim().toLowerCase();
  if (['0', 'false', 'no', 'off'].includes(s)) return false;
  if (['1', 'true', 'yes', 'on'].includes(s)) return true;
  return defaultValue;
}

/**
 * @param {boolean} enabled
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
export function assertStepsWritesEnabled(enabled) {
  if (enabled) return { ok: true };
  return { ok: false, error: STEPS_WRITES_DISABLED_MESSAGE };
}
