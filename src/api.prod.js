const TOKEN_KEY = 'step-counter-session';
const AUTH_ATTEMPT_KEY = 'step-counter-auth-attempted';
const OAUTH_STATE_KEY = 'step-counter-oauth-state';
const OAUTH_REDIRECT_KEY = 'step-counter-oauth-redirect';

/**
 * Wild Apricot / Apps Script production API client.
 * Uses JSONP for GETs and text/plain POSTs so Apps Script works from GitHub Pages
 * (Apps Script does not support CORS preflight; WA CSP blocks it entirely).
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

  function jsonp(action, query = {}) {
    return new Promise((resolve) => {
      if (!base) {
        resolve({ ok: false, error: 'APPS_SCRIPT_URL is not configured' });
        return;
      }
      const cb = `aiwcdCb_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
      const url = new URL(base);
      url.searchParams.set('action', action);
      url.searchParams.set('callback', cb);
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null && value !== '') {
          url.searchParams.set(key, String(value));
        }
      }
      const token = sessionStorage.getItem(TOKEN_KEY);
      if (token) url.searchParams.set('sessionToken', token);

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
        if (data && data.sessionToken) {
          sessionStorage.setItem(TOKEN_KEY, data.sessionToken);
        }
        finish(data && typeof data === 'object' ? data : { ok: false, error: 'Invalid JSONP response' });
      };
      script.onerror = () =>
        finish({
          ok: false,
          error:
            'Could not reach the step API (blocked or offline). If this is the club website embed, open the hosted tracker instead.',
        });
      script.src = url.toString();
      document.head.appendChild(script);
      setTimeout(() => finish({ ok: false, error: 'Step API timed out' }), 20000);
    });
  }

  async function postAction(action, body = {}) {
    if (!base) {
      return { ok: false, error: 'APPS_SCRIPT_URL is not configured' };
    }
    const url = new URL(base);
    url.searchParams.set('action', action);
    const token = sessionStorage.getItem(TOKEN_KEY);
    if (token) url.searchParams.set('sessionToken', token);

    // text/plain avoids CORS preflight (Apps Script cannot answer OPTIONS).
    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ ...body, sessionToken: token }),
      redirect: 'follow',
    });
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

    hasSession() {
      return Boolean(sessionStorage.getItem(TOKEN_KEY));
    },

    async loginAs() {
      return { ok: false, error: 'Club sign-in is handled by the website session' };
    },

    async startClubLogin() {
      const siteFromConfig = String(config.WA_SITE_URL || '').replace(/\/$/, '');
      const pub = await jsonp('public_config');
      if (!pub.ok) {
        throw new Error(pub.error || 'Could not load club login settings');
      }
      const clientId = String(pub.waClientId || config.WA_CLIENT_ID || '');
      const accountId = String(pub.waAccountId || config.WA_ACCOUNT_ID || '');
      const site = String(pub.waSiteUrl || siteFromConfig || '').replace(/\/$/, '');
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
      return jsonp('me', { date: selectedDate });
    },

    async logSteps(steps, date) {
      return postAction('log', { steps, date });
    },

    async getPublicTotal() {
      return jsonp('public_total');
    },

    async getLeaderboard() {
      return jsonp('leaderboard');
    },
  };
}
