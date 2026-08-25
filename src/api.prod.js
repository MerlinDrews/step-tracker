const TOKEN_KEY = 'step-counter-session';
const AUTH_ATTEMPT_KEY = 'step-counter-auth-attempted';
const OAUTH_STATE_KEY = 'step-counter-oauth-state';
const OAUTH_REDIRECT_KEY = 'step-counter-oauth-redirect';

/**
 * Wild Apricot / Apps Script production API client.
 * Prefer fetch (Apps Script sends Access-Control-Allow-Origin: *).
 * JSONP is a fallback — some browsers fire script.onerror on the
 * script.google.com → googleusercontent.com redirect.
 * @param {Record<string, unknown>} config
 */
export function createProdApi(config) {
  const base = String(config.APPS_SCRIPT_URL || '').replace(/\/$/, '');

  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get('sessionToken');
  if (fromUrl) {
    sessionStorage.setItem(TOKEN_KEY, fromUrl);
    sessionStorage.removeItem(AUTH_ATTEMPT_KEY);
    params.delete('sessionToken');
    const clean = `${window.location.pathname}${params.toString() ? `?${params}` : ''}${window.location.hash}`;
    window.history.replaceState({}, '', clean);
  }

  function pageRedirectUri() {
    return window.location.href.split('?')[0].split('#')[0];
  }

  function buildUrl(action, query = {}) {
    const url = new URL(base);
    url.searchParams.set('action', action);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
    const token = sessionStorage.getItem(TOKEN_KEY);
    if (token) url.searchParams.set('sessionToken', token);
    return url;
  }

  function storeSessionFrom(data) {
    if (data && data.sessionToken) {
      sessionStorage.setItem(TOKEN_KEY, data.sessionToken);
    }
  }

  function jsonp(action, query = {}) {
    return new Promise((resolve) => {
      if (!base) {
        resolve({ ok: false, error: 'APPS_SCRIPT_URL is not configured' });
        return;
      }
      const cb = `aiwcdCb_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
      const url = buildUrl(action, query);
      url.searchParams.set('callback', cb);

      const script = document.createElement('script');
      let settled = false;
      const finish = (data) => {
        if (settled) return;
        settled = true;
        delete window[cb];
        script.remove();
        resolve(data);
      };

      window[cb] = (data) => {
        storeSessionFrom(data);
        finish(data && typeof data === 'object' ? data : { ok: false, error: 'Invalid JSONP response' });
      };
      script.onerror = () =>
        finish({
          ok: false,
          error: 'Could not reach the step API (script load failed).',
        });
      script.async = true;
      script.src = url.toString();
      document.head.appendChild(script);
      setTimeout(() => finish({ ok: false, error: 'Step API timed out' }), 20000);
    });
  }

  async function fetchGet(action, query = {}) {
    if (!base) {
      return { ok: false, error: 'APPS_SCRIPT_URL is not configured' };
    }
    const res = await fetch(buildUrl(action, query).toString(), {
      method: 'GET',
      redirect: 'follow',
      credentials: 'omit',
    });
    const data = await res.json().catch(() => ({}));
    storeSessionFrom(data);
    if (data.ok === false) return data;
    if (!res.ok) {
      return { ok: false, error: data.error || `Request failed (${res.status})` };
    }
    return data.ok === undefined ? { ok: true, ...data } : data;
  }

  async function getAction(action, query = {}) {
    try {
      return await fetchGet(action, query);
    } catch {
      return jsonp(action, query);
    }
  }

  async function postAction(action, body = {}) {
    if (!base) {
      return { ok: false, error: 'APPS_SCRIPT_URL is not configured' };
    }
    const token = sessionStorage.getItem(TOKEN_KEY);
    // text/plain avoids CORS preflight when possible.
    const res = await fetch(buildUrl(action).toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ ...body, sessionToken: token }),
      redirect: 'follow',
      credentials: 'omit',
    });
    const data = await res.json().catch(() => ({}));
    storeSessionFrom(data);
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

    hasSession() {
      return Boolean(sessionStorage.getItem(TOKEN_KEY));
    },

    async loginAs() {
      return { ok: false, error: 'Club sign-in is handled by the website session' };
    },

    async startClubLogin() {
      const siteFromConfig = String(config.WA_SITE_URL || '').replace(/\/$/, '');
      let clientId = String(config.WA_CLIENT_ID || '');
      let accountId = String(config.WA_ACCOUNT_ID || '');
      let site = siteFromConfig;

      if (!clientId || !accountId || !site) {
        const pub = await getAction('public_config');
        if (!pub.ok) {
          throw new Error(pub.error || 'Could not load club login settings');
        }
        clientId = clientId || String(pub.waClientId || '');
        accountId = accountId || String(pub.waAccountId || '');
        site = site || String(pub.waSiteUrl || '').replace(/\/$/, '');
      }

      if (!clientId || !accountId || !site) {
        throw new Error('Club login is not configured (missing WA client/account/site)');
      }

      const state =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `sc-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const redirectUri = pageRedirectUri();
      sessionStorage.setItem(OAUTH_STATE_KEY, state);
      sessionStorage.setItem(OAUTH_REDIRECT_KEY, redirectUri);

      const url = new URL(`${site}/sys/login/OAuthLogin`);
      url.searchParams.set('client_id', clientId);
      url.searchParams.set('redirect_uri', redirectUri);
      url.searchParams.set('scope', 'contacts_me');
      url.searchParams.set('claimed_account_id', accountId);
      url.searchParams.set('response_type', 'authorization_code');
      url.searchParams.set('state', state);
      window.location.href = url.toString();
    },

    async completeOAuthFromRedirect() {
      const q = new URLSearchParams(window.location.search);
      const code = q.get('code');
      if (!code) return { ok: true, skipped: true };

      const state = q.get('state');
      const expected = sessionStorage.getItem(OAUTH_STATE_KEY);
      const redirectUri = sessionStorage.getItem(OAUTH_REDIRECT_KEY) || pageRedirectUri();

      q.delete('code');
      q.delete('state');
      const clean = `${window.location.pathname}${q.toString() ? `?${q}` : ''}${window.location.hash}`;
      window.history.replaceState({}, '', clean);

      if (!expected || !state || state !== expected) {
        return { ok: false, error: 'Login state mismatch. Click Connect club login again.' };
      }
      sessionStorage.removeItem(OAUTH_STATE_KEY);
      sessionStorage.removeItem(OAUTH_REDIRECT_KEY);

      const res = await postAction('auth_exchange', { code, redirect_uri: redirectUri });
      if (res.ok) {
        sessionStorage.removeItem(AUTH_ATTEMPT_KEY);
      }
      return res;
    },

    async logout() {
      sessionStorage.removeItem(TOKEN_KEY);
      return postAction('logout', {});
    },

    async getMe(selectedDate) {
      return getAction('me', { date: selectedDate });
    },

    async logSteps(steps, date) {
      return postAction('log', { steps, date });
    },

    async getPublicTotal() {
      return getAction('public_total');
    },

    async getLeaderboard() {
      return getAction('leaderboard');
    },
  };
}
