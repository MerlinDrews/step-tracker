import { createProdApi } from './api.prod.js';

/**
 * Widget / Wild Apricot embed entry — always production, never local mock.
 * Reads per-instance boot config so multiple gadgets on one page do not clash.
 */
export function createApi() {
  const boot = window.__AIWCD_BOOT__ || {};
  const config = {
    ...(boot.config || window.STEP_COUNTER_CONFIG || {}),
    MODE: 'prod',
    EMBEDDED: true,
  };
  return createProdApi(config);
}
