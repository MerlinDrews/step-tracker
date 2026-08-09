/** Sensible daily step bounds for a club challenge. */
export const MIN_STEPS = 0;
export const MAX_STEPS = 100_000;

/**
 * @param {unknown} value
 * @returns {{ ok: true, steps: number } | { ok: false, error: string }}
 */
export function validateSteps(value) {
  if (value === null || value === undefined || value === '') {
    return { ok: false, error: 'Enter a step count' };
  }

  const n = typeof value === 'number' ? value : Number(String(value).trim());

  if (!Number.isFinite(n)) {
    return { ok: false, error: 'Steps must be a number' };
  }
  if (!Number.isInteger(n)) {
    return { ok: false, error: 'Steps must be a whole number' };
  }
  if (n < MIN_STEPS) {
    return { ok: false, error: 'Steps cannot be negative' };
  }
  if (n > MAX_STEPS) {
    return { ok: false, error: `Steps cannot exceed ${MAX_STEPS.toLocaleString()}` };
  }

  return { ok: true, steps: n };
}
