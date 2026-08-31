import { describe, expect, it } from 'vitest';
import {
  buildMonthGrid,
  defaultTrackableDate,
  formatDisplayDate,
  formatTrackingWindowLabel,
  isWithinTrackingWindow,
  parseDateKey,
  resolveTrackingWindow,
  toDateKey,
  todayKey,
  trackingDateInputBounds,
  validateDateKey,
} from '../src/domain/dates.js';

const WINDOW = { start: '2026-09-01', end: '2026-10-31' };

describe('dates', () => {
  it('formats a fixed local date as YYYY-MM-DD', () => {
    const d = new Date(2026, 7, 9); // Aug 9, 2026 local
    expect(toDateKey(d)).toBe('2026-08-09');
  });

  it('pads month and day', () => {
    expect(toDateKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('todayKey matches toDateKey(new Date())', () => {
    expect(todayKey()).toBe(toDateKey(new Date()));
  });

  it('throws on invalid date', () => {
    expect(() => toDateKey('not-a-date')).toThrow(/Invalid date/);
  });

  it('parses and rejects invalid calendar dates', () => {
    expect(parseDateKey('2026-08-09')?.getDate()).toBe(9);
    expect(parseDateKey('2026-02-31')).toBeNull();
    expect(parseDateKey('08-09-2026')).toBeNull();
  });

  it('validateDateKey allows today and past, rejects future', () => {
    expect(validateDateKey('2026-08-09', '2026-08-09', null)).toEqual({
      ok: true,
      date: '2026-08-09',
    });
    expect(validateDateKey('2026-08-01', '2026-08-09', null).ok).toBe(true);
    expect(validateDateKey('2026-08-10', '2026-08-09', null).ok).toBe(false);
  });

  it('validateDateKey enforces tracking window', () => {
    expect(validateDateKey('2026-09-15', '2026-09-20', WINDOW).ok).toBe(true);
    expect(validateDateKey('2026-08-31', '2026-09-20', WINDOW).ok).toBe(false);
    expect(validateDateKey('2026-11-01', '2026-11-02', WINDOW).ok).toBe(false);
    expect(validateDateKey('2026-09-01', '2026-09-01', WINDOW)).toEqual({
      ok: true,
      date: '2026-09-01',
    });
    expect(validateDateKey('2026-10-31', '2026-10-31', WINDOW).ok).toBe(true);
  });

  it('resolves tracking window from config-like sources', () => {
    expect(resolveTrackingWindow()).toEqual(WINDOW);
    expect(
      resolveTrackingWindow({ TRACKING_START: '2027-01-01', TRACKING_END: '2027-02-28' }),
    ).toEqual({ start: '2027-01-01', end: '2027-02-28' });
  });

  it('defaultTrackableDate clamps to the window', () => {
    expect(defaultTrackableDate('2026-08-31', WINDOW)).toBe('2026-09-01');
    expect(defaultTrackableDate('2026-09-15', WINDOW)).toBe('2026-09-15');
    expect(defaultTrackableDate('2026-11-05', WINDOW)).toBe('2026-10-31');
  });

  it('trackingDateInputBounds caps max by today', () => {
    expect(trackingDateInputBounds('2026-09-15', WINDOW)).toEqual({
      min: '2026-09-01',
      max: '2026-09-15',
    });
    expect(trackingDateInputBounds('2026-08-20', WINDOW)).toEqual({
      min: '2026-09-01',
      max: '2026-09-01',
    });
  });

  it('formats display dates and window label', () => {
    expect(formatDisplayDate('2026-08-09')).toMatch(/9/);
    expect(formatDisplayDate('2026-08-09')).toMatch(/2026/);
    expect(formatTrackingWindowLabel(WINDOW)).toMatch(/Sep/);
    expect(formatTrackingWindowLabel(WINDOW)).toMatch(/Oct/);
  });

  it('builds a month grid with selection, history, and out-of-range markers', () => {
    const grid = buildMonthGrid(2026, 7, {
      today: '2026-08-09',
      selected: '2026-08-07',
      history: { '2026-08-07': 8200 },
      window: WINDOW,
    });
    expect(grid.label).toMatch(/August/);
    const selected = grid.cells.find((c) => c.type === 'day' && c.date === '2026-08-07');
    expect(selected?.isSelected).toBe(true);
    expect(selected?.hasEntry).toBe(true);
    expect(selected?.isOutOfRange).toBe(true);
    expect(selected?.isTrackable).toBe(false);
    const future = grid.cells.find((c) => c.type === 'day' && c.date === '2026-08-10');
    expect(future?.isFuture).toBe(true);

    const sept = buildMonthGrid(2026, 8, {
      today: '2026-09-15',
      selected: '2026-09-10',
      window: WINDOW,
    });
    const inWindow = sept.cells.find((c) => c.type === 'day' && c.date === '2026-09-10');
    expect(inWindow?.isTrackable).toBe(true);
    expect(isWithinTrackingWindow('2026-09-10', WINDOW)).toBe(true);
  });
});
