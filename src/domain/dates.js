/**
 * Calendar date key in YYYY-MM-DD (local timezone of the provided Date).
 * Documented convention: use the user's/browser local day for "today".
 */
export function toDateKey(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) {
    throw new Error('Invalid date');
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayKey() {
  return toDateKey(new Date());
}

const DATE_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Parse YYYY-MM-DD as a local calendar date (not UTC).
 * @returns {Date|null}
 */
export function parseDateKey(dateKey) {
  const match = DATE_KEY_RE.exec(String(dateKey || ''));
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const date = new Date(y, m - 1, d);
  if (
    date.getFullYear() !== y ||
    date.getMonth() !== m - 1 ||
    date.getDate() !== d
  ) {
    return null;
  }
  return date;
}

/**
 * Accept logging for today or any past day (local calendar). Reject future dates.
 * @param {unknown} value
 * @param {string} [today=todayKey()]
 * @returns {{ ok: true, date: string } | { ok: false, error: string }}
 */
export function validateDateKey(value, today = todayKey()) {
  if (value === null || value === undefined || value === '') {
    return { ok: false, error: 'Choose a date' };
  }
  const key = String(value).trim();
  if (!parseDateKey(key)) {
    return { ok: false, error: 'Date must be YYYY-MM-DD' };
  }
  if (key > today) {
    return { ok: false, error: 'Cannot log steps for a future date' };
  }
  return { ok: true, date: key };
}

/** Human label like "9 Aug 2026" */
export function formatDisplayDate(dateKey) {
  const d = parseDateKey(dateKey);
  if (!d) return String(dateKey || '');
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Build a Sunday-start month grid for calendar UI.
 * @param {number} year
 * @param {number} monthIndex 0-11
 * @param {{ today?: string, selected?: string, history?: Record<string, number> }} [opts]
 */
export function buildMonthGrid(year, monthIndex, opts = {}) {
  const today = opts.today || todayKey();
  const selected = opts.selected || today;
  const history = opts.history || {};

  const first = new Date(year, monthIndex, 1);
  const startPad = first.getDay(); // 0 = Sunday
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const cells = [];

  for (let i = 0; i < startPad; i++) {
    cells.push({ type: 'empty' });
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const date = toDateKey(new Date(year, monthIndex, day));
    const steps = history[date];
    cells.push({
      type: 'day',
      day,
      date,
      steps: steps === undefined ? null : Number(steps),
      hasEntry: steps !== undefined && steps !== null,
      isToday: date === today,
      isSelected: date === selected,
      isFuture: date > today,
    });
  }

  while (cells.length % 7 !== 0) {
    cells.push({ type: 'empty' });
  }

  const label = first.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  return { year, monthIndex, label, cells };
}
