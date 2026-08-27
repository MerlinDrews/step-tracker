import { describe, expect, it } from 'vitest';
import { aggregateTotals, dedupeDailyRows, findStepsForDate, historyForContact, leaderboardTotals, personalTotal } from '../src/domain/totals.js';

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

  it('dedupes same person/day before summing (latest updated_at wins)', () => {
    const rows = [
      { date: '2026-08-09', contactId: '1', steps: 1000, updated_at: 't1' },
      { date: '2026-08-09', contactId: '1', steps: 9999, updated_at: 't2' },
      { date: '2026-08-08', contactId: '1', steps: 500, updated_at: 't1' },
    ];
    expect(aggregateTotals(rows).totalSteps).toBe(10499);
    expect(personalTotal(rows, '1')).toBe(10499);
  });

  it('leaderboardTotals returns top N and participant count', () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({
      contactId: String(i + 1),
      name: `P${i + 1}`,
      steps: (12 - i) * 1000,
    }));
    const board = leaderboardTotals(rows, 10);
    expect(board.contributors).toHaveLength(10);
    expect(board.participantCount).toBe(12);
    expect(board.leaderboardLimit).toBe(10);
    expect(board.contributors[0]).toEqual({ name: expect.any(String), steps: 12000 });
    expect(board.contributors[0]).not.toHaveProperty('email');
    expect(board.contributors[0]).not.toHaveProperty('contactId');
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
