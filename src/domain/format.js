import { LEADERBOARD_LIMIT } from './totals.js';

export function formatSteps(n) {
  const num = Number(n) || 0;
  return num.toLocaleString('en-US');
}

/**
 * Map totals API response into a simple display model.
 * @param {{ totalSteps?: number, contributors?: Array<object>, participantCount?: number, leaderboardLimit?: number }} totals
 * @param {{ limit?: number }} [opts]
 */
export function toLeaderboardView(totals, opts = {}) {
  const limit = opts.limit ?? totals.leaderboardLimit ?? LEADERBOARD_LIMIT;
  const contributors = totals.contributors || [];
  const participantCount = totals.participantCount ?? contributors.length;
  const rows = contributors.slice(0, limit).map((c, i) => ({
    rank: i + 1,
    name: c.name,
    stepsLabel: formatSteps(c.steps),
    steps: c.steps,
    contactId: String(c.contactId),
  }));

  return {
    totalStepsLabel: formatSteps(totals.totalSteps),
    totalSteps: totals.totalSteps,
    rows,
    participantCount,
    leaderboardLimit: limit,
    hasMoreParticipants: participantCount > rows.length,
  };
}
