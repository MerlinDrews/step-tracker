import { describe, expect, it } from 'vitest';
import { ACTION_LIMITS, checkRateLimit, isActionRateLimited } from '../worker/src/rateLimit.js';

describe('rateLimit', () => {
  it('defines limits for every authenticated and public Worker action', () => {
    expect(Object.keys(ACTION_LIMITS).sort()).toEqual(
      [
        'admin_contributors',
        'admin_participant',
        'admin_set_steps',
        'auth_exchange',
        'leaderboard',
        'log',
        'logout',
        'me',
        'public_config',
        'public_total',
      ].sort(),
    );
  });

  it('blocks after the configured max within a window', () => {
    const key = `test:${Date.now()}`;
    expect(checkRateLimit(key, 2, 60_000)).toBe(true);
    expect(checkRateLimit(key, 2, 60_000)).toBe(true);
    expect(checkRateLimit(key, 2, 60_000)).toBe(false);
  });

  it('returns false when an action has no configured limit', () => {
    expect(isActionRateLimited('unknown_action', '127.0.0.1')).toBe(false);
  });
});
