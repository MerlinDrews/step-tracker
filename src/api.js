import { createLocalHttpApi } from './api.local.js';

function getConfig() {
  return window.STEP_COUNTER_CONFIG || { MODE: 'local' };
}

const TOKEN_KEY = 'step-counter-session';

function createProdApi(config) {
  const base = (config.APPS_SCRIPT_URL || '').replace(/\/$/, '');

  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get('sessionToken');
  if (fromUrl) {
    sessionStorage.setItem(TOKEN_KEY, fromUrl);
    params.delete('sessionToken');
    const clean = `${window.location.pathname}${params.toString() ? `?${params}` : ''}${window.location.hash}`;
    window.history.replaceState({}, '', clean);
  }

  async function request(action, { method = 'GET', body, query } = {}) {
    if (!base) {
      return { ok: false, error: 'APPS_SCRIPT_URL is not configured' };
    }
    const url = new URL(base);
    url.searchParams.set('action', action);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null && value !== '') {
          url.searchParams.set(key, String(value));
        }
      }
    }
    const token = sessionStorage.getItem(TOKEN_KEY);
    if (token) url.searchParams.set('sessionToken', token);

    const headers = { Accept: 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;

    const opts = { method, headers, redirect: 'follow' };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify({ ...body, sessionToken: token });
    }

    const res = await fetch(url.toString(), opts);
    const data = await res.json().catch(() => ({}));
    if (data.sessionToken) {
      sessionStorage.setItem(TOKEN_KEY, data.sessionToken);
    }
    if (data.ok === false) return data;
    if (!res.ok) {
      return { ok: false, error: data.error || `Request failed (${res.status})` };
    }
    return data.ok === undefined ? { ok: true, ...data } : data;
  }

  return {
    mode: 'prod',

    listMockUsers() {
      return [];
    },

    async loginAs() {
      return { ok: false, error: 'Use Sign in with club account in production' };
    },

    startClubLogin() {
      if (!base) throw new Error('APPS_SCRIPT_URL is not configured');
      const start = config.AUTH_START_PATH || '?action=auth_start';
      const returnTo = encodeURIComponent(window.location.href.split('?')[0].split('#')[0]);
      window.location.href = `${base}${start}&return_to=${returnTo}`;
    },

    async logout() {
      sessionStorage.removeItem(TOKEN_KEY);
      return request('logout', { method: 'POST', body: {} });
    },

    async getMe(selectedDate) {
      return request('me', { query: { date: selectedDate } });
    },

    async logSteps(steps, date) {
      return request('log', { method: 'POST', body: { steps, date } });
    },

    async getTotals() {
      return request('totals');
    },
  };
}

/** Local mode talks to the CSV-backed Node server. Prod uses Apps Script. */
export function createApi() {
  const config = getConfig();
  if ((config.MODE || 'local') === 'local') {
    return createLocalHttpApi();
  }
  return createProdApi(config);
}
