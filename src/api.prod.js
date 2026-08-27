const TOKEN_KEY = 'step-counter-session';
const AUTH_ATTEMPT_KEY = 'step-counter-auth-attempted';
const OAUTH_STATE_KEY = 'step-counter-oauth-state';
const OAUTH_REDIRECT_KEY = 'step-counter-oauth-redirect';

/**
 * Cloudflare Worker production API client.
 * Public reads use GET; authenticated calls use POST with sessionToken in the body
 * (text/plain JSON — simple CORS, no preflight).
 * @param {Record<string, unknown>} config
 */
export function createProdApi(config) {
  const base = String(config.WORKER_URL || '').replace(/\/$/, '');

  function pageRedirectUri() {
    return window.location.href.split('?')[0].split('#')[0];
  }

  function buildUrl(action) {
    const url = new URL(base);
    url.searchParams.set('action', action);
    return url;
  }

  function storeSessionFrom(data) {
    if (data && data.sessionToken) {
      sessionStorage.setItem(TOKEN_KEY, data.sessionToken);
    }
  }

  async function fetchGet(action) {
    if (!base) {
      return { ok: false, error: 'WORKER_URL is not configured' };
    }
    try {
      const res = await fetch(buildUrl(action).toString(), {
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
    } catch {
      return { ok: false, error: 'Could not reach the step API.' };
    }
  }

  async function postAction(action, body = {}) {
    if (!base) {
      return { ok: false, error: 'WORKER_URL is not configured' };
    }
    const token = sessionStorage.getItem(TOKEN_KEY);
    try {
      const res = await fetch(buildUrl(action).toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ ...body, ...(token ? { sessionToken: token } : {}) }),
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
    } catch {
      return { ok: false, error: 'Could not reach the step API.' };
    }
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
        const pub = await fetchGet('public_config');
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
      return postAction('me', { date: selectedDate });
    },

    async logSteps(steps, date) {
      return postAction('log', { steps, date });
    },

    async getPublicTotal() {
      return fetchGet('public_total');
    },

    async getLeaderboard() {
      return postAction('leaderboard');
    },

    async adminSetSteps(contactId, steps, date, profile = {}) {
      return postAction('admin_set_steps', {
        contactId,
        steps,
        date,
        ...profile,
      });
    },

    async adminContributors() {
      return postAction('admin_contributors');
    },

    async adminParticipant(contactId, date) {
      return postAction('admin_participant', { contactId, date });
    },
  };
}
