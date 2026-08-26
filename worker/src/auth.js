import { parseGroupsFromFieldValues } from '../../src/domain/membership.js';

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
    email: member.email,
    name: member.name,
    membershipStatus: member.membershipStatus || 'Active',
    groups: member.groups || [],
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
  if (expected !== parts[1]) return null;
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
  if (!resp.ok) throw new Error(`Token exchange failed: ${JSON.stringify(data)}`);
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
  if (!resp.ok) throw new Error(`contacts/me failed: ${JSON.stringify(raw)}`);
  return {
    contactId: String(raw.Id),
    email: raw.Email || '',
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
  if (!resp.ok) throw new Error(`Admin token failed: ${JSON.stringify(data)}`);
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
  if (!resp.ok) throw new Error(`contacts/${contactId} failed: ${JSON.stringify(raw)}`);
  return raw;
}

export async function enrichMemberGroups(member, config) {
  if ((member.groups || []).length > 0) return member;
  try {
    const raw = await fetchContactAdmin(member.contactId, config);
    member.groups = parseGroupsFromFieldValues(raw.FieldValues);
    if (raw.Status) member.membershipStatus = raw.Status;
    if (raw.Email) member.email = raw.Email;
    const name = [raw.FirstName, raw.LastName].filter(Boolean).join(' ');
    if (name) member.name = name;
  } catch {
    member.groups = [];
  }
  return member;
}
