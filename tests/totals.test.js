import { describe, expect, it } from 'vitest';
import { aggregateTotals, findStepsForDate, historyForContact } from '../src/domain/totals.js';

describe('aggregateTotals', () => {
  it('returns zeros for empty', () => {
    expect(aggregateTotals([])).toEqual({ totalSteps: 0, contributors: [] });
  });

  it('sums per person across days and sorts descending', () => {
    const rows = [
      { contactId: '1', name: 'Alex', email: 'a@ex.com', steps: 1000 },
      { contactId: '1', name: 'Alex', email: 'a@ex.com', steps: 2000 },
      { contactId: '2', name: 'Jordan', email: 'b@ex.com', steps: 4000 },
    ];
    const result = aggregateTotals(rows);
    expect(result.totalSteps).toBe(7000);
    expect(result.contributors.map((c) => c.name)).toEqual(['Jordan', 'Alex']);
    expect(result.contributors[0].steps).toBe(4000);
    expect(result.contributors[1].steps).toBe(3000);
  });
});

describe('findStepsForDate / historyForContact', () => {
  it('finds a day or returns null', () => {
    const rows = [{ date: '2026-08-09', contactId: '1', steps: 42 }];
    expect(findStepsForDate(rows, '1', '2026-08-09')).toBe(42);
    expect(findStepsForDate(rows, '1', '2026-08-08')).toBeNull();
  });

  it('builds a history map for one contact', () => {
    const rows = [
      { date: '2026-08-08', contactId: '1', steps: 100 },
      { date: '2026-08-09', contactId: '1', steps: 200 },
      { date: '2026-08-09', contactId: '2', steps: 999 },
    ];
    expect(historyForContact(rows, '1')).toEqual({
      '2026-08-08': 100,
      '2026-08-09': 200,
    });
  });
});
