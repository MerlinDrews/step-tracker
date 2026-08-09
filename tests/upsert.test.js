import { describe, expect, it } from 'vitest';
import { upsertDailySteps } from '../src/domain/upsert.js';

describe('upsertDailySteps', () => {
  const base = [
    {
      date: '2026-08-08',
      contactId: '1',
      email: 'a@ex.com',
      name: 'Alex',
      steps: 1000,
      updated_at: 't0',
    },
    {
      date: '2026-08-08',
      contactId: '2',
      email: 'b@ex.com',
      name: 'Jordan',
      steps: 2000,
      updated_at: 't0',
    },
  ];

  it('inserts a new day row', () => {
    const next = upsertDailySteps(base, {
      date: '2026-08-09',
      contactId: '1',
      email: 'a@ex.com',
      name: 'Alex',
      steps: 5000,
      updated_at: 't1',
    });
    expect(next).toHaveLength(3);
    expect(next.find((r) => r.date === '2026-08-09' && String(r.contactId) === '1').steps).toBe(5000);
    expect(base).toHaveLength(2);
  });

  it('updates the same person/day and leaves others alone', () => {
    const next = upsertDailySteps(base, {
      date: '2026-08-08',
      contactId: '1',
      steps: 9999,
      updated_at: 't2',
    });
    expect(next).toHaveLength(2);
    expect(next.find((r) => String(r.contactId) === '1').steps).toBe(9999);
    expect(next.find((r) => String(r.contactId) === '2').steps).toBe(2000);
  });
});
