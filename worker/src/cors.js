/**
 * Allowed browser origins: hosted tracker (GitHub Pages) + club WA site (launcher widget).
 * @param {{ frontendOrigin?: string, waSiteUrl?: string }} config
 */
export function allowedOrigins(config) {
  /** @type {Set<string>} */
  const set = new Set();
  for (const raw of [config.frontendOrigin, config.waSiteUrl]) {
    const origin = normalizeOrigin(raw);
    if (origin) set.add(origin);
  }
  return set;
}

/** @param {string|null|undefined} value */
export function normalizeOrigin(value) {
  if (!value) return '';
  try {
    const url = new URL(String(value));
    return url.origin;
  } catch {
    return '';
  }
}

/**
 * @param {Request} request
 * @param {{ frontendOrigin?: string, waSiteUrl?: string }} config
 */
export function isOriginAllowed(request, config) {
  const origin = request.headers.get('Origin');
  if (!origin) return true;
  return allowedOrigins(config).has(origin);
}

/**
 * Reflect the request Origin when allowlisted; omit ACAO for non-browser callers.
 * @param {Request} request
 * @param {{ frontendOrigin?: string, waSiteUrl?: string }} config
 * @returns {Record<string, string>}
 */
export function corsHeadersForRequest(request, config) {
  const origin = request.headers.get('Origin');
  if (!origin) return {};
  if (!allowedOrigins(config).has(origin)) return {};
  return { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' };
}

export const CORS_METHOD_HEADERS = {
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};
