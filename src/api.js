import { createLocalHttpApi } from './api.local.js';
import { createProdApi } from './api.prod.js';

function getConfig() {
  return window.STEP_COUNTER_CONFIG || { MODE: 'local' };
}

/** Local mode talks to the CSV-backed Node server. Prod uses Apps Script. */
export function createApi() {
  const config = getConfig();
  // Embeds are always production, even if MODE was left unset/wrong.
  if (config.EMBEDDED) {
    return createProdApi({ ...config, MODE: 'prod' });
  }
  if ((config.MODE || 'local') === 'local') {
    return createLocalHttpApi();
  }
  return createProdApi(config);
}
