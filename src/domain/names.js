/**
 * Public display names: first name + last-name prefix (e.g. "Alex R.").
 * Prefix grows until unique among people who share the same first name.
 */

/**
 * @param {string} [fullName]
 * @returns {{ firstName: string, lastName: string }}
 */
export function parsePersonName(fullName) {
  const cleaned = String(fullName || '')
    .trim()
    .replace(/\s+/g, ' ');
  if (!cleaned) return { firstName: '', lastName: '' };
  const space = cleaned.indexOf(' ');
  if (space < 0) return { firstName: cleaned, lastName: '' };
  return {
    firstName: cleaned.slice(0, space),
    lastName: cleaned.slice(space + 1).replace(/\.+$/, ''),
  };
}

/**
 * @param {string} firstName
 * @param {string} lastName
 * @param {number} prefixLen  letters of last name to show (1…lastName.length)
 */
export function formatDisplayName(firstName, lastName, prefixLen) {
  const first = String(firstName || '').trim();
  const last = String(lastName || '').trim().replace(/\.+$/, '');
  if (!first && !last) return '';
  if (!last) return first;
  const len = Math.min(Math.max(1, prefixLen), last.length);
  const prefix = last.slice(0, len);
  if (len < last.length) return `${first} ${prefix}.`;
  return `${first} ${last}`;
}

/**
 * @param {{ firstName?: string, lastName?: string, name?: string }} person
 * @returns {{ firstName: string, lastName: string }}
 */
export function resolveNameParts(person) {
  const first = String(person?.firstName ?? '').trim();
  const last = String(person?.lastName ?? '')
    .trim()
    .replace(/\.+$/, '');
  if (first || last || person?.firstName != null || person?.lastName != null) {
    if (first || last) return { firstName: first, lastName: last };
  }
  return parsePersonName(person?.name);
}

/**
 * @param {Array<{ contactId: string|number, firstName?: string, lastName?: string, name?: string }>} people
 * @returns {Map<string, string>} contactId → public display name
 */
export function uniqueDisplayNames(people) {
  const parsed = (people || []).map((p) => {
    const parts = resolveNameParts(p);
    return {
      contactId: String(p.contactId),
      firstName: parts.firstName,
      lastName: parts.lastName,
    };
  });

  /** @type {Map<string, string>} */
  const out = new Map();

  for (const person of parsed) {
    if (!person.firstName && !person.lastName) {
      out.set(person.contactId, `Member ${person.contactId}`);
      continue;
    }
    if (!person.lastName) {
      out.set(person.contactId, person.firstName);
      continue;
    }

    let len = 1;
    const max = person.lastName.length;
    while (len < max) {
      const prefix = person.lastName.slice(0, len).toLowerCase();
      const firstKey = person.firstName.toLowerCase();
      const conflict = parsed.some((other) => {
        if (other.contactId === person.contactId) return false;
        if (other.firstName.toLowerCase() !== firstKey) return false;
        if (!other.lastName) return false;
        return other.lastName.slice(0, len).toLowerCase() === prefix;
      });
      if (!conflict) break;
      len += 1;
    }
    out.set(person.contactId, formatDisplayName(person.firstName, person.lastName, len));
  }

  return out;
}

/**
 * Replace `.name` with a unique public display name; drops first/last from the result.
 * @template {{ contactId: string|number, name?: string, firstName?: string, lastName?: string }} T
 * @param {T[]} contributors
 * @returns {Array<Omit<T, 'firstName' | 'lastName'> & { name: string }>}
 */
export function withPublicNames(contributors) {
  const list = contributors || [];
  const map = uniqueDisplayNames(list);
  return list.map((c) => {
    const { firstName: _f, lastName: _l, ...rest } = c;
    return {
      ...rest,
      name: map.get(String(c.contactId)) || c.name || `Member ${c.contactId}`,
    };
  });
}
