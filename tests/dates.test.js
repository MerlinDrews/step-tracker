import { describe, expect, it } from 'vitest';
import {
  buildMonthGrid,
  formatDisplayDate,
  parseDateKey,
  toDateKey,
  todayKey,
  validateDateKey,
} from '../src/domain/dates.js';

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
    expect(validateDateKey('2026-08-09', '2026-08-09')).toEqual({ ok: true, date: '2026-08-09' });
    expect(validateDateKey('2026-08-01', '2026-08-09').ok).toBe(true);
    expect(validateDateKey('2026-08-10', '2026-08-09').ok).toBe(false);
  });

  it('formats display dates', () => {
    expect(formatDisplayDate('2026-08-09')).toMatch(/9/);
    expect(formatDisplayDate('2026-08-09')).toMatch(/2026/);
  });

  it('builds a month grid with selection and history markers', () => {
    const grid = buildMonthGrid(2026, 7, {
      today: '2026-08-09',
      selected: '2026-08-07',
      history: { '2026-08-07': 8200 },
    });
    expect(grid.label).toMatch(/August/);
    const selected = grid.cells.find((c) => c.type === 'day' && c.date === '2026-08-07');
    expect(selected?.isSelected).toBe(true);
    expect(selected?.hasEntry).toBe(true);
    const future = grid.cells.find((c) => c.type === 'day' && c.date === '2026-08-10');
    expect(future?.isFuture).toBe(true);
  });
});
