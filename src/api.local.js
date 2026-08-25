const TOKEN_KEY = 'step-counter-local-session';

/**
 * Browser client for the local CSV-backed Node server (`npm run serve`).
 */
export function createLocalHttpApi() {
  async function request(path, { method = 'GET', body } = {}) {
    const headers = { Accept: 'application/json' };
    const token = sessionStorage.getItem(TOKEN_KEY);
    if (token) headers.Authorization = `Bearer ${token}`;

    const opts = { method, headers };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }

    let res;
    try {
      res = await fetch(`/api${path}`, opts);
    } catch {
      return {
        ok: false,
        error: 'Local API unavailable. Run `npm run serve` (CSV-backed local server).',
      };
    }

    const data = await res.json().catch(() => ({}));
    if (data.sessionToken) {
      sessionStorage.setItem(TOKEN_KEY, data.sessionToken);
    }
    return data;
  }

  return {
    mode: 'local',

    listMockUsers() {
      // Synchronous list for UI; mirrors server mock users
      return [
        { id: 'alex', label: 'Alex Rivera (in Step Challenge)' },
        { id: 'jordan', label: 'Jordan Lee (in Step Challenge)' },
        { id: 'outsider', label: 'Outside Member (wrong group)' },
        { id: 'inactive', label: 'Inactive Member (rejected)' },
      ];
    },

    hasSession() {
      return Boolean(sessionStorage.getItem(TOKEN_KEY));
    },

    async loginAs(mockUserId) {
      const res = await request('/login', { method: 'POST', body: { userId: mockUserId } });
      if (res.ok && res.sessionToken) {
        sessionStorage.setItem(TOKEN_KEY, res.sessionToken);
      }
      return res;
    },

    async logout() {
      const res = await request('/logout', { method: 'POST', body: {} });
      sessionStorage.removeItem(TOKEN_KEY);
      return res.ok === false ? res : { ok: true };
    },

    async getMe(selectedDate) {
      const q = selectedDate ? `?date=${encodeURIComponent(selectedDate)}` : '';
      return request(`/me${q}`);
    },

    async logSteps(steps, date) {
      return request('/log', { method: 'POST', body: { steps, date } });
    },

    async getPublicTotal() {
      return request('/public-total');
    },

    async getLeaderboard() {
      return request('/leaderboard');
    },
  };
}
