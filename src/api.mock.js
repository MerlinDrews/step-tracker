import { createMockHandlers } from './mock/handlers.js';
import { defaultSeedRows } from './mock/members.js';

/**
 * In-memory mock API for unit tests (optional localStorage seed).
 * Browser local mode uses the CSV-backed HTTP API via createLocalHttpApi.
 */
export function createMockApi(initialRows = defaultSeedRows()) {
  let rows = initialRows.map((r) => ({ ...r }));
  let token = null;
  let member = null;

  const api = createMockHandlers({
    loadRows: () => rows,
    saveRows: (next) => {
      rows = next;
    },
    getSession: () => ({ token, member }),
    setSession: (session) => {
      token = session.token;
      member = session.member;
    },
    // Unit tests control dates freely; local CSV server uses the real window.
    trackingWindow: null,
  });

  return {
    ...api,
    _resetForTests(nextRows = defaultSeedRows()) {
      rows = nextRows.map((r) => ({ ...r }));
      token = null;
      member = null;
    },
    _getState() {
      return { sessionToken: token, member, rows };
    },
  };
}
