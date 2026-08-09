/**
 * @typedef {{ contactId: string|number, email?: string, name?: string, membershipStatus?: string }} Member
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
    // Treat missing status as active when contact exists (some WA payloads omit it).
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
