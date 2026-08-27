import { parseGroupsFromFieldValues } from '../../src/domain/membership.js';

/** In-isolate cache — at most one Admin API lookup per member per TTL window. */
/** @type {Map<string, { membershipStatus: string, groups: Array<{ id: string, label: string }>, name?: string, email?: string, exp: number }>} */
const memberCache = new Map();

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function base64UrlEncode(bytes) {
  let binary = '';
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) binary += String.fromCharCode(arr[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(str) {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  const binary = atob(padded + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function hmacSign(body, secret) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
}

export async function createSessionToken(member, secret) {
  const payload = {
    contactId: member.contactId,
    name: member.name,
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
  };
  const body = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = base64UrlEncode(await hmacSign(body, secret));
  return `${body}.${sig}`;
}

export async function parseSessionToken(token, secret) {
  if (!token || !secret) return null;
  const raw = String(token).replace(/^Bearer\s+/i, '');
  const parts = raw.split('.');
  if (parts.length !== 2) return null;
  const expected = base64UrlEncode(await hmacSign(parts[0], secret));
  if (!timingSafeEqual(expected, parts[1])) return null;
  try {
    const json = new TextDecoder().decode(base64UrlDecode(parts[0]));
    const payload = JSON.parse(json);
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function isAllowedRedirectUri(uri, config) {
  const allowedHosts = {};
  function addOrigin(origin) {
    if (!origin) return;
    let host = String(origin)
      .replace(/^https?:\/\//i, '')
      .split('/')[0]
      .toLowerCase();
    if (!host) return;
    allowedHosts[host] = true;
    if (host.startsWith('www.')) allowedHosts[host.slice(4)] = true;
    else allowedHosts[`www.${host}`] = true;
  }
  addOrigin(config.waSiteUrl);
  addOrigin(config.frontendOrigin);
  const uriHost = String(uri)
    .replace(/^https?:\/\//i, '')
    .split('/')[0]
    .toLowerCase();
  return Boolean(uriHost && allowedHosts[uriHost]);
}

export async function exchangeCode(code, redirectUri, config) {
  const basic = btoa(`${config.waClientId}:${config.waClientSecret}`);
  const resp = await fetch('https://oauth.wildapricot.org/auth/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: String(code),
      client_id: config.waClientId,
      redirect_uri: String(redirectUri),
      scope: 'contacts_me',
    }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    console.error('Token exchange failed', resp.status, data);
    throw new Error('Token exchange failed');
  }
  return data;
}

export async function fetchContactMe(accessToken, accountId) {
  const resp = await fetch(
    `https://api.wildapricot.org/v2/accounts/${accountId}/contacts/me`,
    {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    },
  );
  const raw = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    console.error('contacts/me failed', resp.status, raw);
    throw new Error('Could not load member profile');
  }
  return {
    contactId: String(raw.Id),
    email: raw.Email || '',
    firstName: String(raw.FirstName || '').trim(),
    lastName: String(raw.LastName || '').trim(),
    name: [raw.FirstName, raw.LastName].filter(Boolean).join(' ') || raw.Email || 'Member',
    membershipStatus: raw.Status || 'Active',
    groups: parseGroupsFromFieldValues(raw.FieldValues),
  };
}

let adminTokenCache = { token: null, exp: 0 };

async function getAdminAccessToken(config) {
  if (adminTokenCache.token && adminTokenCache.exp > Date.now()) {
    return adminTokenCache.token;
  }
  const basic = config.waApiKey
    ? btoa(`APIKEY:${config.waApiKey}`)
    : btoa(`${config.waClientId}:${config.waClientSecret}`);
  const resp = await fetch('https://oauth.wildapricot.org/auth/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ grant_type: 'client_credentials', scope: 'auto' }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    console.error('Admin token failed', resp.status, data);
    throw new Error('Admin API unavailable');
  }
  const ttlMs = Math.max(60, Math.min(Number(data.expires_in || 1800) - 60, 21600)) * 1000;
  adminTokenCache = { token: data.access_token, exp: Date.now() + ttlMs };
  return data.access_token;
}

async function fetchContactAdmin(contactId, config) {
  const token = await getAdminAccessToken(config);
  const resp = await fetch(
    `https://api.wildapricot.org/v2/accounts/${config.waAccountId}/contacts/${encodeURIComponent(contactId)}`,
    { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } },
  );
  const raw = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    console.error(`contacts/${contactId} failed`, resp.status, raw);
    throw new Error('Member lookup failed');
  }
  return raw;
}

function canUseAdminApi(config) {
  return Boolean(config.waApiKey || (config.waClientId && config.waClientSecret));
}

function membershipFromCache(entry) {
  return {
    membershipStatus: entry.membershipStatus,
    groups: entry.groups,
    name: entry.name,
    firstName: entry.firstName,
    lastName: entry.lastName,
    email: entry.email,
  };
}

/** Seed cache after login so the first authenticated request skips a WA round-trip. */
export function seedMemberCache(member, ttlMs) {
  memberCache.set(String(member.contactId), {
    membershipStatus: member.membershipStatus || 'Active',
    groups: member.groups || [],
    name: member.name,
    firstName: member.firstName || '',
    lastName: member.lastName || '',
    email: member.email,
    exp: Date.now() + ttlMs,
  });
}

/**
 * Refresh membership from WA Admin API when cache expired (default 15 min).
 * Falls back to token / stale cache when Admin API is unavailable.
 * @param {object} member
 * @param {{ memberRefreshTtlMs: number, waApiKey?: string, waClientId?: string, waClientSecret?: string }} config
 */
export async function ensureFreshMember(member, config) {
  if (!member?.contactId) return member;

  const id = String(member.contactId);
  const ttlMs = config.memberRefreshTtlMs;
  const cached = memberCache.get(id);

  if (cached && cached.exp > Date.now()) {
    return { ...member, ...membershipFromCache(cached) };
  }

  if (!canUseAdminApi(config)) {
    return member;
  }

  try {
    const raw = await fetchContactAdmin(id, config);
    const fresh = {
      membershipStatus: raw.Status || member.membershipStatus || 'Active',
      groups: parseGroupsFromFieldValues(raw.FieldValues),
      firstName: String(raw.FirstName || member.firstName || '').trim(),
      lastName: String(raw.LastName || member.lastName || '').trim(),
      name:
        [raw.FirstName, raw.LastName].filter(Boolean).join(' ') || member.name,
      email: raw.Email || member.email,
      exp: Date.now() + ttlMs,
    };
    memberCache.set(id, fresh);
    return { ...member, ...membershipFromCache(fresh) };
  } catch (err) {
    console.warn('Member refresh failed', id, err?.message || err);
    if (cached) {
      return { ...member, ...membershipFromCache(cached) };
    }
    return member;
  }
}

export async function enrichMemberGroups(member, config) {
  if ((member.groups || []).length > 0) return member;
  try {
    const raw = await fetchContactAdmin(member.contactId, config);
    member.groups = parseGroupsFromFieldValues(raw.FieldValues);
    if (raw.Status) member.membershipStatus = raw.Status;
    if (raw.Email) member.email = raw.Email;
    const firstName = String(raw.FirstName || '').trim();
    const lastName = String(raw.LastName || '').trim();
    if (firstName) member.firstName = firstName;
    if (lastName) member.lastName = lastName;
    const name = [raw.FirstName, raw.LastName].filter(Boolean).join(' ');
    if (name) member.name = name;
  } catch {
    member.groups = [];
  }
  return member;
}
