import { createLocalHttpApi } from './api.local.js';
import { createProdApi } from './api.prod.js';

function onGitHubPages() {
  return typeof location !== 'undefined' && /\.github\.io$/i.test(location.hostname);
}

function getConfig() {
  const base = window.STEP_COUNTER_CONFIG || {};
  // Hosted tracker is always production — never the local CSV mock.
  if (onGitHubPages()) {
    return { ...base, MODE: 'prod' };
  }
  return { MODE: 'local', ...base };
}

/** Local mode talks to the CSV-backed Node server. Prod uses the Cloudflare Worker. */
export function createApi() {
  const config = getConfig();
  if ((config.MODE || 'local') === 'local') {
    return createLocalHttpApi();
  }
  return createProdApi({ ...config, MODE: 'prod' });
}
