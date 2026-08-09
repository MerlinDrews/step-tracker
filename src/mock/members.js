export const MOCK_MEMBERS = {
  alex: {
    contactId: '1001',
    email: 'alex@example.com',
    name: 'Alex Rivera',
    membershipStatus: 'Active',
  },
  jordan: {
    contactId: '1002',
    email: 'jordan@example.com',
    name: 'Jordan Lee',
    membershipStatus: 'Active',
  },
  inactive: {
    contactId: '1999',
    email: 'inactive@example.com',
    name: 'Inactive Member',
    membershipStatus: 'Lapsed',
  },
};

export function listMockUsers() {
  return [
    { id: 'alex', label: 'Alex Rivera (active)' },
    { id: 'jordan', label: 'Jordan Lee (active)' },
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
    { date: daysAgo(2, from), contactId: '1001', email: 'alex@example.com', name: 'Alex Rivera', steps: 8200, updated_at: ts },
    { date: daysAgo(1, from), contactId: '1001', email: 'alex@example.com', name: 'Alex Rivera', steps: 9100, updated_at: ts },
    { date: daysAgo(2, from), contactId: '1002', email: 'jordan@example.com', name: 'Jordan Lee', steps: 6500, updated_at: ts },
    { date: daysAgo(1, from), contactId: '1002', email: 'jordan@example.com', name: 'Jordan Lee', steps: 10200, updated_at: ts },
  ];
}
