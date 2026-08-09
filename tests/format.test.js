import { describe, expect, it } from 'vitest';
import { formatSteps, toLeaderboardView } from '../src/domain/format.js';

describe('format', () => {
  it('formats with thousands separators', () => {
    expect(formatSteps(842350)).toBe((842350).toLocaleString('en-US'));
  });

  it('maps totals to leaderboard view', () => {
    const view = toLeaderboardView({
      totalSteps: 3000,
      contributors: [
        { contactId: '2', name: 'Jordan', steps: 2000 },
        { contactId: '1', name: 'Alex', steps: 1000 },
      ],
    });
    expect(view.totalStepsLabel).toBe(formatSteps(3000));
    expect(view.rows[0]).toMatchObject({ rank: 1, name: 'Jordan', contactId: '2' });
  });
});
