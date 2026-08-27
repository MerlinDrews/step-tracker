import {
  assertActiveMember,
  assertAdminMember,
  assertAuthorizedMember,
  isAdminMember,
  resolveNameParts,
  todayKey,
  uniqueDisplayNames,
  validateDateKey,
  validateSteps,
  withPublicNames,
} from '../../src/domain/index.js';
import {
  createSessionToken,
  enrichMemberGroups,
  ensureFreshMember,
  exchangeCode,
  fetchContactMe,
  isAllowedRedirectUri,
  parseSessionToken,
  seedMemberCache,
} from './auth.js';
import {
  getAllContributors,
  getClubTotal,
  getContactNameParts,
  getDaySteps,
  getHistoryForContact,
  getLeaderboardTotals,
  getPersonalTotal,
  updateContactDisplayNames,
  upsertDaySteps,
  writeAuditLog,
} from './db.js';
import { isActionRateLimited } from './rateLimit.js';

/**
 * @typedef {Record<string, string>} CorsHeaders
 * @typedef {{ corsHeaders: CorsHeaders, clientIp: string }} RequestContext
 */

function json(data, status, corsHeaders) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...corsHeaders,
    },
  });
}

function jsonOk(obj, corsHeaders) {
  return json({ ok: true, ...obj }, 200, corsHeaders);
}

function jsonErr(message, status, corsHeaders) {
  return json({ ok: false, error: message, status }, status, corsHeaders);
}

/** Client-facing member object — never includes lastName. */
function memberPayload(member, config) {
  if (!member) return member;
  const { lastName: _last, firstName, ...rest } = member;
  const payload = { ...rest };
  if (firstName) payload.firstName = firstName;
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
  const member = await parseSessionToken(token, config.sessionSecret);
  if (!member) return null;
  return ensureFreshMember(member, config);
}

function rateLimited(action, ctx) {
  return isActionRateLimited(action, ctx.clientIp);
}

/**
 * Build the participant set for display-name disambiguation, including the current member.
 * @returns {Promise<{ parts: Array<object>, displays: Map<string, string> }>}
 */
async function resolvePublicNames(db, member) {
  const existing = await getContactNameParts(db);
  const parts = resolveNameParts(member);
  const people = existing.filter((p) => String(p.contactId) !== String(member.contactId));
  people.push({
    contactId: String(member.contactId),
    firstName: parts.firstName || member.firstName || '',
    lastName: parts.lastName || member.lastName || '',
    name: member.name,
  });
  // Prefer stored first/last when present; otherwise parse name.
  const normalized = people.map((p) => {
    const resolved = resolveNameParts(p);
    return {
      contactId: String(p.contactId),
      firstName: resolved.firstName,
      lastName: resolved.lastName,
    };
  });
  return { parts: normalized, displays: uniqueDisplayNames(normalized) };
}

async function applyMemberPublicName(db, member) {
  const { displays } = await resolvePublicNames(db, member);
  const parts = resolveNameParts(member);
  member.firstName = parts.firstName || member.firstName || '';
  member.lastName = parts.lastName || member.lastName || '';
  member.name =
    displays.get(String(member.contactId)) ||
    member.name ||
    `Member ${member.contactId}`;
  return member;
}

export async function handleAction(action, method, body, config, db, ctx) {
  const { corsHeaders } = ctx;

  try {
    if (action === 'public_config' && method === 'GET') {
      if (rateLimited(action, ctx)) {
        return jsonErr('Too many requests. Try again shortly.', 429, corsHeaders);
      }
      return jsonOk(
        {
          waClientId: config.waClientId,
          waAccountId: config.waAccountId,
          waSiteUrl: config.waSiteUrl,
        },
        corsHeaders,
      );
    }

    if (action === 'public_total' && method === 'GET') {
      if (rateLimited(action, ctx)) {
        return jsonErr('Too many requests. Try again shortly.', 429, corsHeaders);
      }
      return jsonOk({ totalSteps: await getClubTotal(db) }, corsHeaders);
    }

    if (action === 'auth_exchange' && method === 'POST') {
      if (rateLimited(action, ctx)) {
        return jsonErr('Too many sign-in attempts. Try again shortly.', 429, corsHeaders);
      }
      const code = body?.code;
      const redirectUri = body?.redirect_uri;
      if (!code || !redirectUri) return jsonErr('Missing code or redirect_uri', 400, corsHeaders);
      if (!isAllowedRedirectUri(String(redirectUri), config)) {
        return jsonErr('redirect_uri is not allowed', 400, corsHeaders);
      }
      const token = await exchangeCode(code, redirectUri, config);
      let member = await fetchContactMe(token.access_token, config.waAccountId);
      member = await enrichMemberGroups(member, config);
      member = await applyMemberPublicName(db, member);
      seedMemberCache(member, config.memberRefreshTtlMs);
      const gate = assertActiveMember(member);
      if (!gate.ok) return jsonErr(gate.error, 403, corsHeaders);
      const sessionToken = await createSessionToken(member, config.sessionSecret);
      return jsonOk({ sessionToken, member: memberPayload(member, config) }, corsHeaders);
    }

    if (action === 'leaderboard' && method === 'POST') {
      if (rateLimited(action, ctx)) {
        return jsonErr('Too many requests. Try again shortly.', 429, corsHeaders);
      }
      const member = await resolveMember(body, config);
      if (!member) return jsonErr('Not signed in', 401, corsHeaders);
      const gate = assertActiveMember(member);
      if (!gate.ok) return jsonErr(gate.error, 403, corsHeaders);
      await applyMemberPublicName(db, member);
      const totals = await getLeaderboardTotals(db, config.leaderboardLimit);
      return jsonOk(
        {
          member: memberPayload(member, config),
          totals,
          ...(await trackExtras(db, member, config)),
        },
        corsHeaders,
      );
    }

    if (action === 'me' && method === 'POST') {
      if (rateLimited(action, ctx)) {
        return jsonErr('Too many requests. Try again shortly.', 429, corsHeaders);
      }
      const member = await resolveMember(body, config);
      if (!member) return jsonErr('Not signed in', 401, corsHeaders);
      const gate = assertAuthorizedMember(
        member,
        config.allowedGroupIds,
        config.allowedGroupNames,
      );
      if (!gate.ok) return jsonErr(gate.error, 403, corsHeaders);
      await applyMemberPublicName(db, member);

      const today = todayKey();
      const dateCheck = validateDateKey(body?.date || today, today);
      if (!dateCheck.ok) return jsonErr(dateCheck.error, 400, corsHeaders);

      const daySteps = await getDaySteps(db, member.contactId, dateCheck.date);
      const history = await getHistoryForContact(db, member.contactId);

      return jsonOk(
        {
          member: memberPayload(member, config),
          today,
          selectedDate: dateCheck.date,
          daySteps,
          todaySteps: await getDaySteps(db, member.contactId, today),
          history,
          canTrack: true,
          personalTotal: await getPersonalTotal(db, member.contactId),
        },
        corsHeaders,
      );
    }

    if (action === 'log' && method === 'POST') {
      if (rateLimited(action, ctx)) {
        return jsonErr('Too many save attempts. Try again shortly.', 429, corsHeaders);
      }
      const member = await resolveMember(body, config);
      if (!member) return jsonErr('Not signed in', 401, corsHeaders);
      const gate = assertAuthorizedMember(
        member,
        config.allowedGroupIds,
        config.allowedGroupNames,
      );
      if (!gate.ok) return jsonErr(gate.error, 403, corsHeaders);

      const validated = validateSteps(body?.steps);
      if (!validated.ok) return jsonErr(validated.error, 400, corsHeaders);

      const today = todayKey();
      const dateCheck = validateDateKey(body?.date || today, today);
      if (!dateCheck.ok) return jsonErr(dateCheck.error, 400, corsHeaders);

      const { displays } = await resolvePublicNames(db, member);
      const parts = resolveNameParts(member);
      const publicName =
        displays.get(String(member.contactId)) ||
        member.name ||
        `Member ${member.contactId}`;
      member.name = publicName;
      member.firstName = parts.firstName;
      member.lastName = parts.lastName;

      const updated_at = new Date().toISOString();
      await upsertDaySteps(db, {
        date: dateCheck.date,
        contactId: member.contactId,
        email: member.email,
        name: publicName,
        firstName: parts.firstName,
        lastName: parts.lastName,
        steps: validated.steps,
        updated_at,
        updated_by_contact_id: member.contactId,
        updated_by_name: publicName,
      });
      await updateContactDisplayNames(db, displays);

      const totals = await getLeaderboardTotals(db, config.leaderboardLimit);
      return jsonOk(
        {
          date: dateCheck.date,
          today,
          steps: validated.steps,
          totals,
          history: await getHistoryForContact(db, member.contactId),
          canTrack: true,
          personalTotal: await getPersonalTotal(db, member.contactId),
        },
        corsHeaders,
      );
    }

    if (action === 'admin_set_steps' && method === 'POST') {
      if (rateLimited(action, ctx)) {
        return jsonErr('Too many admin edits. Try again shortly.', 429, corsHeaders);
      }
      const member = await resolveMember(body, config);
      if (!member) return jsonErr('Not signed in', 401, corsHeaders);
      const adminGate = assertAdminMember(
        member,
        config.adminGroupIds,
        config.adminGroupNames,
      );
      if (!adminGate.ok) return jsonErr(adminGate.error, 403, corsHeaders);

      const contactId = body?.contactId;
      if (contactId === undefined || contactId === null || contactId === '') {
        return jsonErr('Missing contactId', 400, corsHeaders);
      }

      const validated = validateSteps(body?.steps);
      if (!validated.ok) return jsonErr(validated.error, 400, corsHeaders);

      const today = todayKey();
      const dateCheck = validateDateKey(body?.date || today, today);
      if (!dateCheck.ok) return jsonErr(dateCheck.error, 400, corsHeaders);

      const previousSteps = await getDaySteps(db, contactId, dateCheck.date);
      const updated_at = new Date().toISOString();
      const existing = (await getContactNameParts(db)).find(
        (p) => String(p.contactId) === String(contactId),
      );
      const profileParts = resolveNameParts({
        firstName: body?.firstName,
        lastName: body?.lastName,
        name: body?.name || existing?.name || `Member ${contactId}`,
      });
      // Prefer existing stored parts when admin only sends a display name.
      const firstName = existing?.firstName || profileParts.firstName;
      const lastName = existing?.lastName || profileParts.lastName;
      const peerMember = {
        contactId: String(contactId),
        firstName,
        lastName,
        name: body?.name || existing?.name,
      };
      const { displays } = await resolvePublicNames(db, peerMember);
      const publicName =
        displays.get(String(contactId)) || peerMember.name || `Member ${contactId}`;

      await upsertDaySteps(db, {
        date: dateCheck.date,
        contactId: String(contactId),
        email: body?.email || existing?.email || '',
        name: publicName,
        firstName,
        lastName,
        steps: validated.steps,
        updated_at,
        updated_by_contact_id: member.contactId,
        updated_by_name: member.name,
      });
      await updateContactDisplayNames(db, displays);
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

      return jsonOk(
        {
          date: dateCheck.date,
          contactId: String(contactId),
          steps: validated.steps,
          previousSteps,
          totals: await getLeaderboardTotals(db, config.leaderboardLimit),
          member: memberPayload(member, config),
        },
        corsHeaders,
      );
    }

    if (action === 'admin_participant' && method === 'POST') {
      if (rateLimited(action, ctx)) {
        return jsonErr('Too many requests. Try again shortly.', 429, corsHeaders);
      }
      const member = await resolveMember(body, config);
      if (!member) return jsonErr('Not signed in', 401, corsHeaders);
      const adminGate = assertAdminMember(
        member,
        config.adminGroupIds,
        config.adminGroupNames,
      );
      if (!adminGate.ok) return jsonErr(adminGate.error, 403, corsHeaders);

      const contactId = body?.contactId;
      if (contactId === undefined || contactId === null || contactId === '') {
        return jsonErr('Missing contactId', 400, corsHeaders);
      }

      const today = todayKey();
      const dateCheck = validateDateKey(body?.date || today, today);
      if (!dateCheck.ok) return jsonErr(dateCheck.error, 400, corsHeaders);

      const history = await getHistoryForContact(db, String(contactId));
      const daySteps = await getDaySteps(db, contactId, dateCheck.date);

      return jsonOk(
        {
          member: memberPayload(member, config),
          contactId: String(contactId),
          selectedDate: dateCheck.date,
          daySteps,
          history,
        },
        corsHeaders,
      );
    }

    if (action === 'admin_contributors' && method === 'POST') {
      if (rateLimited(action, ctx)) {
        return jsonErr('Too many requests. Try again shortly.', 429, corsHeaders);
      }
      const member = await resolveMember(body, config);
      if (!member) return jsonErr('Not signed in', 401, corsHeaders);
      const adminGate = assertAdminMember(
        member,
        config.adminGroupIds,
        config.adminGroupNames,
      );
      if (!adminGate.ok) return jsonErr(adminGate.error, 403, corsHeaders);
      return jsonOk(
        {
          member: memberPayload(member, config),
          contributors: withPublicNames(await getAllContributors(db)),
        },
        corsHeaders,
      );
    }

    if (action === 'logout' && method === 'POST') {
      if (rateLimited(action, ctx)) {
        return jsonErr('Too many requests. Try again shortly.', 429, corsHeaders);
      }
      return jsonOk({}, corsHeaders);
    }

    return jsonErr('Unknown action', 404, corsHeaders);
  } catch (err) {
    console.error('handleAction error', action, err);
    return jsonErr('Internal server error', 500, corsHeaders);
  }
}
