import {
  aggregateTotals,
  assertActiveMember,
  assertAdminMember,
  assertAuthorizedMember,
  assertSession,
  findStepsForDate,
  historyForContact,
  isAdminMember,
  leaderboardTotals,
  personalTotal,
  resolveNameParts,
  todayKey,
  uniqueDisplayNames,
  upsertDailySteps,
  validateDateKey,
  validateSteps,
  withPublicNames,
} from '../domain/index.js';
import {
  listMockUsers,
  MOCK_ADMIN_GROUP_IDS,
  MOCK_ADMIN_GROUP_NAMES,
  MOCK_ALLOWED_GROUP_IDS,
  MOCK_ALLOWED_GROUP_NAMES,
  MOCK_MEMBERS,
} from './members.js';

/**
 * Shared mock backend handlers. Storage adapters supply rows + session.
 *
 * @param {{
 *   loadRows: () => Array<object> | Promise<Array<object>>,
 *   saveRows: (rows: Array<object>) => void | Promise<void>,
 *   getSession: () => ({ token: string|null, member: object|null }) | Promise<...>,
 *   setSession: (session: { token: string|null, member: object|null }) => void | Promise<void>,
 * }} storage
 */
export function createMockHandlers(storage) {
  function memberPayload(member) {
    if (!member) return member;
    const { lastName: _last, ...rest } = member;
    const payload = { ...rest };
    if (isAdminMember(member, MOCK_ADMIN_GROUP_IDS, MOCK_ADMIN_GROUP_NAMES)) {
      payload.isAdmin = true;
    }
    return payload;
  }

  function peopleFromRows(rows, extra) {
    /** @type {Map<string, object>} */
    const byId = new Map();
    for (const row of rows) {
      byId.set(String(row.contactId), {
        contactId: String(row.contactId),
        firstName: row.firstName,
        lastName: row.lastName,
        name: row.name,
      });
    }
    if (extra) {
      byId.set(String(extra.contactId), {
        contactId: String(extra.contactId),
        firstName: extra.firstName,
        lastName: extra.lastName,
        name: extra.name,
      });
    }
    return [...byId.values()];
  }

  function withRewrittenNames(rows, displays) {
    return rows.map((row) => ({
      ...row,
      name: displays.get(String(row.contactId)) || row.name,
    }));
  }

  function publicizeMember(member, rows) {
    const parts = resolveNameParts(member);
    const displays = uniqueDisplayNames(peopleFromRows(rows, { ...member, ...parts }));
    return {
      ...member,
      firstName: parts.firstName,
      lastName: parts.lastName,
      name: displays.get(String(member.contactId)) || member.name,
    };
  }

  function canTrack(member) {
    return assertAuthorizedMember(
      member,
      MOCK_ALLOWED_GROUP_IDS,
      MOCK_ALLOWED_GROUP_NAMES,
    ).ok;
  }

  function trackPayload(rows, member) {
    if (!canTrack(member)) return {};
    return {
      canTrack: true,
      personalTotal: personalTotal(rows, member.contactId),
    };
  }

  return {
    mode: 'local',

    listMockUsers,

    /** Any Active member may start a session (leaderboard). Track endpoints still check groups. */
    async loginAs(mockUserId) {
      const member = MOCK_MEMBERS[mockUserId];
      if (!member) {
        return { ok: false, error: 'Unknown mock user' };
      }
      const gate = assertActiveMember(member);
      if (!gate.ok) {
        return { ok: false, error: gate.error };
      }
      const rows = await storage.loadRows();
      const publicMember = publicizeMember(member, rows);
      const token = `mock-session-${publicMember.contactId}-${Date.now()}`;
      await storage.setSession({ token, member: publicMember });
      return { ok: true, member: memberPayload(publicMember), sessionToken: token };
    },

    async logout() {
      await storage.setSession({ token: null, member: null });
      return { ok: true };
    },

    async getMe(selectedDate) {
      const session = await storage.getSession();
      const sessionCheck = assertSession(session.token);
      if (!sessionCheck.ok) return { ok: false, error: sessionCheck.error };
      const gate = assertAuthorizedMember(
        session.member,
        MOCK_ALLOWED_GROUP_IDS,
        MOCK_ALLOWED_GROUP_NAMES,
      );
      if (!gate.ok) return { ok: false, error: gate.error };

      const today = todayKey();
      const dateCheck = selectedDate
        ? validateDateKey(selectedDate, today)
        : { ok: true, date: today };
      if (!dateCheck.ok) return dateCheck;

      const rows = await storage.loadRows();
      const publicMember = publicizeMember(session.member, rows);
      await storage.setSession({ ...session, member: publicMember });
      const history = historyForContact(rows, publicMember.contactId);
      const daySteps = findStepsForDate(rows, publicMember.contactId, dateCheck.date);

      return {
        ok: true,
        member: memberPayload(publicMember),
        today,
        selectedDate: dateCheck.date,
        daySteps,
        todaySteps: findStepsForDate(rows, publicMember.contactId, today),
        history,
        canTrack: true,
        personalTotal: personalTotal(rows, publicMember.contactId),
      };
    },

    async logSteps(stepsInput, dateInput) {
      const session = await storage.getSession();
      const sessionCheck = assertSession(session.token);
      if (!sessionCheck.ok) return { ok: false, error: sessionCheck.error };
      const gate = assertAuthorizedMember(
        session.member,
        MOCK_ALLOWED_GROUP_IDS,
        MOCK_ALLOWED_GROUP_NAMES,
      );
      if (!gate.ok) return { ok: false, error: gate.error };

      const validated = validateSteps(stepsInput);
      if (!validated.ok) return validated;

      const today = todayKey();
      const dateCheck = validateDateKey(dateInput ?? today, today);
      if (!dateCheck.ok) return dateCheck;

      const rows = await storage.loadRows();
      const parts = resolveNameParts(session.member);
      const displays = uniqueDisplayNames(
        peopleFromRows(rows, {
          contactId: session.member.contactId,
          firstName: parts.firstName,
          lastName: parts.lastName,
          name: session.member.name,
        }),
      );
      const publicName =
        displays.get(String(session.member.contactId)) || session.member.name;
      let next = upsertDailySteps(rows, {
        date: dateCheck.date,
        contactId: session.member.contactId,
        email: session.member.email,
        name: publicName,
        firstName: parts.firstName,
        lastName: parts.lastName,
        steps: validated.steps,
        updated_at: new Date().toISOString(),
      });
      next = withRewrittenNames(next, displays);
      await storage.saveRows(next);
      const publicMember = {
        ...session.member,
        firstName: parts.firstName,
        lastName: parts.lastName,
        name: publicName,
      };
      await storage.setSession({ ...session, member: publicMember });

      return {
        ok: true,
        date: dateCheck.date,
        today,
        steps: validated.steps,
        totals: leaderboardTotals(next),
        history: historyForContact(next, session.member.contactId),
        canTrack: true,
        personalTotal: personalTotal(next, session.member.contactId),
      };
    },

    /** Public: grand total only (no contributor names). */
    async getPublicTotal() {
      const rows = await storage.loadRows();
      const totals = aggregateTotals(rows);
      return { ok: true, totalSteps: totals.totalSteps };
    },

    /** Members-only: full leaderboard. */
    async getLeaderboard() {
      const session = await storage.getSession();
      const sessionCheck = assertSession(session.token);
      if (!sessionCheck.ok) return { ok: false, error: sessionCheck.error };
      const gate = assertActiveMember(session.member);
      if (!gate.ok) return { ok: false, error: gate.error };

      const rows = await storage.loadRows();
      return {
        ok: true,
        member: memberPayload(session.member),
        totals: leaderboardTotals(rows),
        ...trackPayload(rows, session.member),
      };
    },

    async adminSetSteps(contactId, stepsInput, dateInput, profile = {}) {
      const session = await storage.getSession();
      const sessionCheck = assertSession(session.token);
      if (!sessionCheck.ok) return { ok: false, error: sessionCheck.error };
      const adminGate = assertAdminMember(
        session.member,
        MOCK_ADMIN_GROUP_IDS,
        MOCK_ADMIN_GROUP_NAMES,
      );
      if (!adminGate.ok) return { ok: false, error: adminGate.error };

      const validated = validateSteps(stepsInput);
      if (!validated.ok) return validated;

      const today = todayKey();
      const dateCheck = validateDateKey(dateInput ?? today, today);
      if (!dateCheck.ok) return dateCheck;

      if (contactId === undefined || contactId === null || contactId === '') {
        return { ok: false, error: 'Missing contactId' };
      }

      const rows = await storage.loadRows();
      const previousSteps = findStepsForDate(rows, contactId, dateCheck.date);
      const existingRow = rows.find(
        (r) => r.date === dateCheck.date && String(r.contactId) === String(contactId),
      );
      const parts = resolveNameParts({
        firstName: profile.firstName ?? existingRow?.firstName,
        lastName: profile.lastName ?? existingRow?.lastName,
        name: profile.name || existingRow?.name || `Member ${contactId}`,
      });
      const displays = uniqueDisplayNames(
        peopleFromRows(rows, {
          contactId: String(contactId),
          firstName: parts.firstName,
          lastName: parts.lastName,
          name: profile.name || existingRow?.name,
        }),
      );
      const publicName = displays.get(String(contactId)) || parts.firstName || `Member ${contactId}`;

      let next = upsertDailySteps(rows, {
        date: dateCheck.date,
        contactId: String(contactId),
        email: profile.email || existingRow?.email || '',
        name: publicName,
        firstName: parts.firstName,
        lastName: parts.lastName,
        steps: validated.steps,
        updated_at: new Date().toISOString(),
      });
      next = withRewrittenNames(next, displays);
      await storage.saveRows(next);

      return {
        ok: true,
        date: dateCheck.date,
        contactId: String(contactId),
        steps: validated.steps,
        previousSteps,
        totals: leaderboardTotals(next),
        member: memberPayload(session.member),
      };
    },

    async adminParticipant(contactId, selectedDate) {
      const session = await storage.getSession();
      const sessionCheck = assertSession(session.token);
      if (!sessionCheck.ok) return { ok: false, error: sessionCheck.error };
      const adminGate = assertAdminMember(
        session.member,
        MOCK_ADMIN_GROUP_IDS,
        MOCK_ADMIN_GROUP_NAMES,
      );
      if (!adminGate.ok) return { ok: false, error: adminGate.error };

      if (contactId === undefined || contactId === null || contactId === '') {
        return { ok: false, error: 'Missing contactId' };
      }

      const today = todayKey();
      const dateCheck = selectedDate
        ? validateDateKey(selectedDate, today)
        : { ok: true, date: today };
      if (!dateCheck.ok) return dateCheck;

      const rows = await storage.loadRows();
      const history = historyForContact(rows, contactId);
      const daySteps = findStepsForDate(rows, contactId, dateCheck.date);

      return {
        ok: true,
        member: memberPayload(session.member),
        contactId: String(contactId),
        selectedDate: dateCheck.date,
        daySteps,
        history,
      };
    },

    async adminContributors() {
      const session = await storage.getSession();
      const sessionCheck = assertSession(session.token);
      if (!sessionCheck.ok) return { ok: false, error: sessionCheck.error };
      const adminGate = assertAdminMember(
        session.member,
        MOCK_ADMIN_GROUP_IDS,
        MOCK_ADMIN_GROUP_NAMES,
      );
      if (!adminGate.ok) return { ok: false, error: adminGate.error };

      const rows = await storage.loadRows();
      const totals = aggregateTotals(rows);
      return {
        ok: true,
        member: memberPayload(session.member),
        contributors: withPublicNames(totals.contributors),
      };
    },
  };
}
