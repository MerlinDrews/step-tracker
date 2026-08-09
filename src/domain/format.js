export function formatSteps(n) {
  const num = Number(n) || 0;
  return num.toLocaleString('en-US');
}

/**
 * Map totals API response into a simple display model.
 */
export function toLeaderboardView(totals) {
  return {
    totalStepsLabel: formatSteps(totals.totalSteps),
    totalSteps: totals.totalSteps,
    rows: (totals.contributors || []).map((c, i) => ({
      rank: i + 1,
      name: c.name,
      stepsLabel: formatSteps(c.steps),
      steps: c.steps,
      contactId: String(c.contactId),
    })),
  };
}
