import { describe, expect, it } from 'vitest';
import { formatSteps, toLeaderboardView } from '../src/domain/format.js';

describe('format', () => {
  it('formats with thousands separators', () => {
    expect(formatSteps(842350)).toBe((842350).toLocaleString('en-US'));
  });

  it('maps totals to leaderboard view with top-10 metadata', () => {
    const view = toLeaderboardView({
      totalSteps: 3000,
      contributors: [
        { contactId: '2', name: 'Jordan', steps: 2000 },
        { contactId: '1', name: 'Alex', steps: 1000 },
      ],
      participantCount: 15,
      leaderboardLimit: 10,
    });
    expect(view.totalStepsLabel).toBe(formatSteps(3000));
    expect(view.rows[0]).toMatchObject({ rank: 1, name: 'Jordan', contactId: '2' });
    expect(view.hasMoreParticipants).toBe(true);
    expect(view.participantCount).toBe(15);
  });

  it('never renders more than the leaderboard limit even if API sends extra rows', () => {
    const contributors = Array.from({ length: 15 }, (_, i) => ({
      contactId: String(i + 1),
      name: `P${i + 1}`,
      steps: (15 - i) * 1000,
    }));
    const view = toLeaderboardView({
      totalSteps: 120000,
      contributors,
      participantCount: 15,
      leaderboardLimit: 10,
    });
    expect(view.rows).toHaveLength(10);
    expect(view.rows[0].name).toBe('P1');
    expect(view.rows[9].name).toBe('P10');
    expect(view.hasMoreParticipants).toBe(true);
  });
});
