export const MOCK_ALLOWED_GROUP_IDS = ['9001'];
export const MOCK_ALLOWED_GROUP_NAMES = ['Step Challenge'];
export const MOCK_ADMIN_GROUP_IDS = ['8001'];
export const MOCK_ADMIN_GROUP_NAMES = ['Board'];

export const MOCK_MEMBERS = {
  alex: {
    contactId: '1001',
    email: 'alex@example.com',
    name: 'Alex Rivera',
    firstName: 'Alex',
    lastName: 'Rivera',
    membershipStatus: 'Active',
    groups: [{ id: '9001', label: 'Step Challenge' }],
  },
  jordan: {
    contactId: '1002',
    email: 'jordan@example.com',
    name: 'Jordan Lee',
    firstName: 'Jordan',
    lastName: 'Lee',
    membershipStatus: 'Active',
    groups: [{ id: '9001', label: 'Step Challenge' }],
  },
  inactive: {
    contactId: '1999',
    email: 'inactive@example.com',
    name: 'Inactive Member',
    firstName: 'Inactive',
    lastName: 'Member',
    membershipStatus: 'Lapsed',
    groups: [{ id: '9001', label: 'Step Challenge' }],
  },
  outsider: {
    contactId: '3003',
    email: 'outsider@example.com',
    name: 'Outside Member',
    firstName: 'Outside',
    lastName: 'Member',
    membershipStatus: 'Active',
    groups: [{ id: '9002', label: 'Book Club' }],
  },
  admin: {
    contactId: '2002',
    email: 'board@example.com',
    name: 'Board Admin',
    firstName: 'Board',
    lastName: 'Admin',
    membershipStatus: 'Active',
    groups: [
      { id: '8001', label: 'Board' },
      { id: '9001', label: 'Step Challenge' },
    ],
  },
};

export function listMockUsers() {
  return [
    { id: 'alex', label: 'Alex Rivera (in Step Challenge)' },
    { id: 'jordan', label: 'Jordan Lee (in Step Challenge)' },
    { id: 'admin', label: 'Board Admin (admin + Walkathon)' },
    { id: 'outsider', label: 'Outside Member (wrong group)' },
    { id: 'inactive', label: 'Inactive Member (rejected)' },
  ];
}

export function daysAgo(n, from = new Date()) {
  const d = new Date(from);
  d.setDate(d.getDate() - n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function defaultSeedRows(from = new Date()) {
  const ts = from.toISOString();
  return [
    {
      date: daysAgo(2, from),
      contactId: '1001',
      email: 'alex@example.com',
      name: 'Alex R.',
      firstName: 'Alex',
      lastName: 'Rivera',
      steps: 8200,
      updated_at: ts,
    },
    {
      date: daysAgo(1, from),
      contactId: '1001',
      email: 'alex@example.com',
      name: 'Alex R.',
      firstName: 'Alex',
      lastName: 'Rivera',
      steps: 9100,
      updated_at: ts,
    },
    {
      date: daysAgo(2, from),
      contactId: '1002',
      email: 'jordan@example.com',
      name: 'Jordan L.',
      firstName: 'Jordan',
      lastName: 'Lee',
      steps: 6500,
      updated_at: ts,
    },
    {
      date: daysAgo(1, from),
      contactId: '1002',
      email: 'jordan@example.com',
      name: 'Jordan L.',
      firstName: 'Jordan',
      lastName: 'Lee',
      steps: 10200,
      updated_at: ts,
    },
  ];
}
