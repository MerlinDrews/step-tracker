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

/** Inclusive challenge window — override via config.js / Worker TRACKING_* vars. */
export const DEFAULT_TRACKING_START = '2026-09-01';
export const DEFAULT_TRACKING_END = '2026-10-31';

/**
 * @param {{ TRACKING_START?: string, TRACKING_END?: string, trackingStart?: string, trackingEnd?: string, start?: string, end?: string } | null | undefined} source
 * @returns {{ start: string, end: string }}
 */
export function resolveTrackingWindow(source = {}) {
  const start = String(
    source?.TRACKING_START || source?.trackingStart || source?.start || DEFAULT_TRACKING_START,
  ).trim();
  const end = String(
    source?.TRACKING_END || source?.trackingEnd || source?.end || DEFAULT_TRACKING_END,
  ).trim();
  return { start, end };
}

/**
 * @param {string} dateKey
 * @param {{ start: string, end: string } | null | undefined} window
 */
export function isWithinTrackingWindow(dateKey, window) {
  if (!window?.start || !window?.end) return true;
  const key = String(dateKey || '');
  return key >= window.start && key <= window.end;
}

/**
 * Prefer today when trackable; otherwise nearest in-window day (may be future).
 * @param {string} [today=todayKey()]
 * @param {{ start: string, end: string } | null | undefined} [window]
 */
export function defaultTrackableDate(today = todayKey(), window = resolveTrackingWindow()) {
  if (!window?.start || !window?.end) return today;
  if (today < window.start) return window.start;
  if (today > window.end) return window.end;
  return today;
}

/**
 * HTML date input bounds: challenge window capped by today for max.
 * @returns {{ min: string, max: string }}
 */
export function trackingDateInputBounds(today = todayKey(), window = resolveTrackingWindow()) {
  if (!window?.start || !window?.end) {
    return { min: '', max: today };
  }
  const min = window.start;
  let max = today < window.end ? today : window.end;
  if (max < min) max = min;
  return { min, max };
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
 * Accept logging for today or any past day within the tracking window.
 * Pass `window: null` to skip the challenge-range check (tests / open mode).
 * @param {unknown} value
 * @param {string} [today=todayKey()]
 * @param {{ start: string, end: string } | null} [window]
 * @returns {{ ok: true, date: string } | { ok: false, error: string }}
 */
export function validateDateKey(value, today = todayKey(), window = resolveTrackingWindow()) {
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
  if (window?.start && key < window.start) {
    return {
      ok: false,
      error: `Tracking starts on ${formatDisplayDate(window.start)}`,
    };
  }
  if (window?.end && key > window.end) {
    return {
      ok: false,
      error: `Tracking ended on ${formatDisplayDate(window.end)}`,
    };
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

/** Short range label like "1 Sep – 31 Oct 2026" */
export function formatTrackingWindowLabel(window = resolveTrackingWindow()) {
  if (!window?.start || !window?.end) return '';
  return `${formatDisplayDate(window.start)} – ${formatDisplayDate(window.end)}`;
}

/**
 * Build a Sunday-start month grid for calendar UI.
 * @param {number} year
 * @param {number} monthIndex 0-11
 * @param {{ today?: string, selected?: string, history?: Record<string, number>, window?: { start: string, end: string } | null }} [opts]
 */
export function buildMonthGrid(year, monthIndex, opts = {}) {
  const today = opts.today || todayKey();
  const selected = opts.selected || today;
  const history = opts.history || {};
  const window =
    opts.window === undefined ? resolveTrackingWindow() : opts.window;

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
    const isFuture = date > today;
    const isOutOfRange = Boolean(window) && !isWithinTrackingWindow(date, window);
    const isTrackable = !isFuture && !isOutOfRange;
    cells.push({
      type: 'day',
      day,
      date,
      steps: steps === undefined ? null : Number(steps),
      hasEntry: steps !== undefined && steps !== null,
      isToday: date === today,
      isSelected: date === selected,
      isFuture,
      isOutOfRange,
      isTrackable,
    });
  }

  while (cells.length % 7 !== 0) {
    cells.push({ type: 'empty' });
  }

  const label = first.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  return { year, monthIndex, label, cells };
}
