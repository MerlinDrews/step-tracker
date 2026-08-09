import { beforeEach, describe, expect, it } from 'vitest';
import { createMockApi } from '../src/api.mock.js';

describe('createMockApi', () => {
  /** @type {ReturnType<typeof createMockApi>} */
  let api;

  beforeEach(() => {
    api = createMockApi([
      {
        date: '2026-08-08',
        contactId: '1001',
        email: 'alex@example.com',
        name: 'Alex Rivera',
        steps: 1000,
        updated_at: 't0',
      },
    ]);
  });

  it('logs in active mock user and returns me', async () => {
    const login = await api.loginAs('alex');
    expect(login.ok).toBe(true);
    const me = await api.getMe();
    expect(me.ok).toBe(true);
    expect(me.member.name).toBe('Alex Rivera');
  });

  it('rejects inactive mock user', async () => {
    const login = await api.loginAs('inactive');
    expect(login.ok).toBe(false);
    expect(login.error).toMatch(/not active/i);
  });

  it('upserts steps and updates totals', async () => {
    await api.loginAs('alex');
    const logged = await api.logSteps(5000);
    expect(logged.ok).toBe(true);
    expect(logged.totals.totalSteps).toBe(6000);
    const totals = await api.getTotals();
    expect(totals.totals.contributors[0].steps).toBe(6000);
  });

  it('can edit a past day retroactively', async () => {
    await api.loginAs('alex');
    const logged = await api.logSteps(3333, '2026-08-08');
    expect(logged.ok).toBe(true);
    expect(logged.date).toBe('2026-08-08');
    expect(logged.history['2026-08-08']).toBe(3333);
    const me = await api.getMe('2026-08-08');
    expect(me.daySteps).toBe(3333);
  });

  it('rejects future dates', async () => {
    await api.loginAs('alex');
    const logged = await api.logSteps(100, '2999-01-01');
    expect(logged.ok).toBe(false);
  });

  it('requires session for log', async () => {
    const res = await api.logSteps(100);
    expect(res.ok).toBe(false);
  });

  it('signs out', async () => {
    await api.loginAs('alex');
    await api.logout();
    expect((await api.getMe()).ok).toBe(false);
  });
});
