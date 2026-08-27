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
    expect(me.member.name).toBe('Alex R.');
  });

  it('rejects inactive mock user at login', async () => {
    const login = await api.loginAs('inactive');
    expect(login.ok).toBe(false);
    expect(login.error).toMatch(/not active/i);
  });

  it('allows outsider session for leaderboard but not track', async () => {
    const login = await api.loginAs('outsider');
    expect(login.ok).toBe(true);

    const board = await api.getLeaderboard();
    expect(board.ok).toBe(true);
    expect(board.totals.contributors.length).toBeGreaterThan(0);
    expect(board.totals.totalSteps).toBe(1000);

    const me = await api.getMe();
    expect(me.ok).toBe(false);
    expect(me.error).toMatch(/authorized member group/i);

    const logged = await api.logSteps(100);
    expect(logged.ok).toBe(false);
    expect(logged.error).toMatch(/authorized member group/i);
  });

  it('public total exposes number only', async () => {
    const res = await api.getPublicTotal();
    expect(res.ok).toBe(true);
    expect(res.totalSteps).toBe(1000);
    expect(res.totals).toBeUndefined();
    expect(res.contributors).toBeUndefined();
  });

  it('leaderboard requires a session', async () => {
    const res = await api.getLeaderboard();
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/not signed in/i);
  });

  it('leaderboard returns empty contributors cleanly', async () => {
    api = createMockApi([]);
    await api.loginAs('alex');
    const board = await api.getLeaderboard();
    expect(board.ok).toBe(true);
    expect(board.totals.totalSteps).toBe(0);
    expect(board.totals.contributors).toEqual([]);
  });

  it('upserts steps for walkathon members', async () => {
    await api.loginAs('alex');
    const logged = await api.logSteps(5000);
    expect(logged.ok).toBe(true);
    expect(logged.totals.totalSteps).toBe(6000);
    expect(logged.personalTotal).toBe(6000);
    expect(logged.canTrack).toBe(true);
    const pub = await api.getPublicTotal();
    expect(pub.totalSteps).toBe(6000);
    expect(pub.personalTotal).toBeUndefined();
  });

  it('re-logging the same day replaces steps instead of adding', async () => {
    await api.loginAs('alex');
    await api.logSteps(1000, '2026-08-08');
    const second = await api.logSteps(2500, '2026-08-08');
    expect(second.ok).toBe(true);
    expect(second.totals.totalSteps).toBe(2500);
    expect(second.personalTotal).toBe(2500);
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
    expect((await api.getLeaderboard()).ok).toBe(false);
  });

  it('allows admin to edit another participant', async () => {
    await api.loginAs('admin');
    const me = await api.getMe();
    expect(me.ok).toBe(true);
    expect(me.member.isAdmin).toBe(true);

    const res = await api.adminSetSteps('1001', 7777, '2026-08-08');
    expect(res.ok).toBe(true);
    expect(res.steps).toBe(7777);
    expect(res.totals.totalSteps).toBe(7777);

    const pub = await api.getPublicTotal();
    expect(pub.totalSteps).toBe(7777);
  });

  it('returns participant step history for admin calendar', async () => {
    await api.loginAs('admin');
    await api.adminSetSteps('1001', 4321, '2026-08-08');

    const res = await api.adminParticipant('1001', '2026-08-08');
    expect(res.ok).toBe(true);
    expect(res.contactId).toBe('1001');
    expect(res.daySteps).toBe(4321);
    expect(res.history['2026-08-08']).toBe(4321);
  });

  it('rejects admin participant history from non-admin members', async () => {
    await api.loginAs('alex');
    const res = await api.adminParticipant('1002', '2026-08-08');
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/admin|configured/i);
  });

  it('rejects admin edits from non-admin members', async () => {
    await api.loginAs('alex');
    const res = await api.adminSetSteps('1002', 100, '2026-08-08');
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/admin|configured/i);
  });
});
