/**
 * @typedef {{ id: string, label: string }} MemberGroup
 * @typedef {{ contactId: string|number, email?: string, name?: string, membershipStatus?: string, groups?: MemberGroup[] }} Member
 */

const ACTIVE_STATUSES = new Set(['active', 'Active', 'ACTIVE']);

/**
 * @param {Member|null|undefined} member
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
export function assertActiveMember(member) {
  if (!member || member.contactId === undefined || member.contactId === null || member.contactId === '') {
    return { ok: false, error: 'Not signed in' };
  }

  const status = member.membershipStatus;
  if (status === undefined || status === null || status === '') {
    return { ok: true };
  }

  if (!ACTIVE_STATUSES.has(String(status))) {
    return { ok: false, error: 'Membership is not active' };
  }

  return { ok: true };
}

/**
 * @param {string|null|undefined} sessionToken
 */
export function assertSession(sessionToken) {
  if (!sessionToken) {
    return { ok: false, error: 'Not signed in' };
  }
  return { ok: true };
}

/**
 * Parse WA FieldValues entry for SystemCode "Groups".
 * @param {Array<{ SystemCode?: string, FieldName?: string, Value?: unknown }>|null|undefined} fieldValues
 * @returns {MemberGroup[]}
 */
export function parseGroupsFromFieldValues(fieldValues) {
  if (!Array.isArray(fieldValues)) return [];
  const entry = fieldValues.find(
    (f) => f && (f.SystemCode === 'Groups' || f.FieldName === 'Group participation'),
  );
  if (!entry || entry.Value == null) return [];
  const raw = entry.Value;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((g) => ({
      id: String(g.Id ?? g.id ?? ''),
      label: String(g.Label ?? g.label ?? g.Name ?? g.name ?? ''),
    }))
    .filter((g) => g.id || g.label);
}

/**
 * Parse comma/newline separated allow-lists from config strings.
 * @param {string|null|undefined} value
 * @returns {string[]}
 */
export function parseAllowList(value) {
  if (!value) return [];
  return String(value)
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * If both allow-lists are empty, any active member is allowed (open mode).
 * Otherwise member must match at least one allowed group id or name (case-insensitive name).
 *
 * @param {MemberGroup[]|null|undefined} groups
 * @param {string[]} allowedIds
 * @param {string[]} allowedNames
 */
export function assertAllowedGroups(groups, allowedIds = [], allowedNames = []) {
  const ids = (allowedIds || []).map(String);
  const names = (allowedNames || []).map((n) => n.toLowerCase());
  if (ids.length === 0 && names.length === 0) {
    return { ok: true };
  }

  const memberGroups = groups || [];
  for (const g of memberGroups) {
    if (g.id && ids.includes(String(g.id))) return { ok: true };
    if (g.label && names.includes(String(g.label).toLowerCase())) return { ok: true };
  }

  return {
    ok: false,
    error: 'You are not in an authorized member group for this step challenge',
  };
}

/**
 * Active membership + optional group allow-list.
 */
export function assertAuthorizedMember(member, allowedIds = [], allowedNames = []) {
  const active = assertActiveMember(member);
  if (!active.ok) return active;
  return assertAllowedGroups(member?.groups, allowedIds, allowedNames);
}
