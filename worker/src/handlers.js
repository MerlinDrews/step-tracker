import {
  assertActiveMember,
  assertAdminMember,
  assertAuthorizedMember,
  isAdminMember,
  todayKey,
  validateDateKey,
  validateSteps,
} from '../../src/domain/index.js';
import {
  createSessionToken,
  enrichMemberGroups,
  exchangeCode,
  fetchContactMe,
  isAllowedRedirectUri,
  parseSessionToken,
} from './auth.js';
import {
  getAllContributors,
  getClubTotal,
  getDaySteps,
  getHistoryForContact,
  getLeaderboardTotals,
  getPersonalTotal,
  upsertDaySteps,
  writeAuditLog,
} from './db.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    },
  });
}

function jsonOk(obj) {
  return json({ ok: true, ...obj });
}

function jsonErr(message, status = 400) {
  return json({ ok: false, error: message, status }, status);
}

function memberPayload(member, config) {
  if (!member) return member;
  const payload = { ...member };
  if (isAdminMember(member, config.adminGroupIds, config.adminGroupNames)) {
    payload.isAdmin = true;
  }
  return payload;
}

function canTrack(member, config) {
  return assertAuthorizedMember(member, config.allowedGroupIds, config.allowedGroupNames).ok;
}

async function trackExtras(db, member, config) {
  if (!canTrack(member, config)) return {};
  return {
    canTrack: true,
    personalTotal: await getPersonalTotal(db, member.contactId),
  };
}

async function resolveMember(body, config) {
  const token = body?.sessionToken;
  if (!token) return null;
  return parseSessionToken(token, config.sessionSecret);
}

export async function handleAction(action, method, body, config, db) {
  try {
    if (action === 'public_config' && method === 'GET') {
      return jsonOk({
        waClientId: config.waClientId,
        waAccountId: config.waAccountId,
        waSiteUrl: config.waSiteUrl,
      });
    }

    if (action === 'public_total' && method === 'GET') {
      return jsonOk({ totalSteps: await getClubTotal(db) });
    }

    if (action === 'auth_exchange' && method === 'POST') {
      const code = body?.code;
      const redirectUri = body?.redirect_uri;
      if (!code || !redirectUri) return jsonErr('Missing code or redirect_uri', 400);
      if (!isAllowedRedirectUri(String(redirectUri), config)) {
        return jsonErr('redirect_uri is not allowed', 400);
      }
      const token = await exchangeCode(code, redirectUri, config);
      let member = await fetchContactMe(token.access_token, config.waAccountId);
      member = await enrichMemberGroups(member, config);
      const gate = assertActiveMember(member);
      if (!gate.ok) return jsonErr(gate.error, 403);
      const sessionToken = await createSessionToken(member, config.sessionSecret);
      return jsonOk({ sessionToken, member: memberPayload(member, config) });
    }

    if (action === 'leaderboard' && method === 'POST') {
      const member = await resolveMember(body, config);
      if (!member) return jsonErr('Not signed in', 401);
      const gate = assertActiveMember(member);
      if (!gate.ok) return jsonErr(gate.error, 403);
      const totals = await getLeaderboardTotals(db, config.leaderboardLimit);
      return jsonOk({
        member: memberPayload(member, config),
        totals,
        ...(await trackExtras(db, member, config)),
      });
    }

    if (action === 'me' && method === 'POST') {
      const member = await resolveMember(body, config);
      if (!member) return jsonErr('Not signed in', 401);
      const gate = assertAuthorizedMember(
        member,
        config.allowedGroupIds,
        config.allowedGroupNames,
      );
      if (!gate.ok) return jsonErr(gate.error, 403);

      const today = todayKey();
      const dateCheck = validateDateKey(body?.date || today, today);
      if (!dateCheck.ok) return jsonErr(dateCheck.error, 400);

      const daySteps = await getDaySteps(db, member.contactId, dateCheck.date);
      const history = await getHistoryForContact(db, member.contactId);

      return jsonOk({
        member: memberPayload(member, config),
        today,
        selectedDate: dateCheck.date,
        daySteps,
        todaySteps: await getDaySteps(db, member.contactId, today),
        history,
        canTrack: true,
        personalTotal: await getPersonalTotal(db, member.contactId),
      });
    }

    if (action === 'log' && method === 'POST') {
      const member = await resolveMember(body, config);
      if (!member) return jsonErr('Not signed in', 401);
      const gate = assertAuthorizedMember(
        member,
        config.allowedGroupIds,
        config.allowedGroupNames,
      );
      if (!gate.ok) return jsonErr(gate.error, 403);

      const validated = validateSteps(body?.steps);
      if (!validated.ok) return jsonErr(validated.error, 400);

      const today = todayKey();
      const dateCheck = validateDateKey(body?.date || today, today);
      if (!dateCheck.ok) return jsonErr(dateCheck.error, 400);

      const updated_at = new Date().toISOString();
      await upsertDaySteps(db, {
        date: dateCheck.date,
        contactId: member.contactId,
        email: member.email,
        name: member.name,
        steps: validated.steps,
        updated_at,
        updated_by_contact_id: member.contactId,
        updated_by_name: member.name,
      });

      const totals = await getLeaderboardTotals(db, config.leaderboardLimit);
      return jsonOk({
        date: dateCheck.date,
        today,
        steps: validated.steps,
        totals,
        history: await getHistoryForContact(db, member.contactId),
        canTrack: true,
        personalTotal: await getPersonalTotal(db, member.contactId),
      });
    }

    if (action === 'admin_set_steps' && method === 'POST') {
      const member = await resolveMember(body, config);
      if (!member) return jsonErr('Not signed in', 401);
      const adminGate = assertAdminMember(
        member,
        config.adminGroupIds,
        config.adminGroupNames,
      );
      if (!adminGate.ok) return jsonErr(adminGate.error, 403);

      const contactId = body?.contactId;
      if (contactId === undefined || contactId === null || contactId === '') {
        return jsonErr('Missing contactId', 400);
      }

      const validated = validateSteps(body?.steps);
      if (!validated.ok) return jsonErr(validated.error, 400);

      const today = todayKey();
      const dateCheck = validateDateKey(body?.date || today, today);
      if (!dateCheck.ok) return jsonErr(dateCheck.error, 400);

      const previousSteps = await getDaySteps(db, contactId, dateCheck.date);
      const updated_at = new Date().toISOString();
      await upsertDaySteps(db, {
        date: dateCheck.date,
        contactId: String(contactId),
        email: body?.email || '',
        name: body?.name || `Member ${contactId}`,
        steps: validated.steps,
        updated_at,
        updated_by_contact_id: member.contactId,
        updated_by_name: member.name,
      });
      await writeAuditLog(db, {
        at: updated_at,
        action: 'admin_set_steps',
        target_contact_id: String(contactId),
        target_date: dateCheck.date,
        old_steps: previousSteps,
        new_steps: validated.steps,
        actor_contact_id: member.contactId,
        actor_name: member.name,
      });

      return jsonOk({
        date: dateCheck.date,
        contactId: String(contactId),
        steps: validated.steps,
        previousSteps,
        totals: await getLeaderboardTotals(db, config.leaderboardLimit),
        member: memberPayload(member, config),
      });
    }

    if (action === 'admin_contributors' && method === 'POST') {
      const member = await resolveMember(body, config);
      if (!member) return jsonErr('Not signed in', 401);
      const adminGate = assertAdminMember(
        member,
        config.adminGroupIds,
        config.adminGroupNames,
      );
      if (!adminGate.ok) return jsonErr(adminGate.error, 403);
      return jsonOk({
        member: memberPayload(member, config),
        contributors: await getAllContributors(db),
      });
    }

    if (action === 'logout' && method === 'POST') {
      return jsonOk({});
    }

    return jsonErr('Unknown action', 404);
  } catch (err) {
    return jsonErr(String(err?.message || err), 500);
  }
}
