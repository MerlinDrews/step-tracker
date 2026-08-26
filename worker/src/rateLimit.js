/** @type {Map<string, { count: number, resetAt: number }>} */
const buckets = new Map();

/**
 * Best-effort per-isolate rate limit (resets when the Worker cold-starts).
 * @param {string} key
 * @param {number} max
 * @param {number} windowMs
 */
export function checkRateLimit(key, max, windowMs) {
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }
  bucket.count += 1;
  return bucket.count <= max;
}

/** @type {Record<string, { max: number, windowMs: number }>} */
export const ACTION_LIMITS = {
  auth_exchange: { max: 15, windowMs: 15 * 60 * 1000 },
  log: { max: 60, windowMs: 15 * 60 * 1000 },
  admin_set_steps: { max: 30, windowMs: 15 * 60 * 1000 },
  public_total: { max: 120, windowMs: 60 * 1000 },
};

/**
 * @param {string} action
 * @param {string} clientIp
 */
export function isActionRateLimited(action, clientIp) {
  const rule = ACTION_LIMITS[action];
  if (!rule) return false;
  const key = `${action}:${clientIp}`;
  return !checkRateLimit(key, rule.max, rule.windowMs);
}
