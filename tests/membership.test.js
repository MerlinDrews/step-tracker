import { describe, expect, it } from 'vitest';
import {
  assertActiveMember,
  assertAdminMember,
  assertAllowedGroups,
  assertAuthorizedMember,
  assertSession,
  clientMemberView,
  isAdminMember,
  parseAllowList,
  parseGroupsFromFieldValues,
  toAdminContributors,
} from '../src/domain/membership.js';

describe('membership', () => {
  it('requires a contact', () => {
    expect(assertActiveMember(null).ok).toBe(false);
    expect(assertSession(null).ok).toBe(false);
    expect(assertSession('tok').ok).toBe(true);
  });

  it('allows Active members', () => {
    expect(assertActiveMember({ contactId: '1', membershipStatus: 'Active' }).ok).toBe(true);
  });

  it('rejects inactive membership', () => {
    expect(assertActiveMember({ contactId: '1', membershipStatus: 'Lapsed' }).ok).toBe(false);
  });

  it('treats missing status as active', () => {
    expect(assertActiveMember({ contactId: '1' }).ok).toBe(true);
  });

  it('parses allow-lists', () => {
    expect(parseAllowList('9001, 9002\nStep Challenge')).toEqual([
      '9001',
      '9002',
      'Step Challenge',
    ]);
    expect(parseAllowList('')).toEqual([]);
  });

  it('parses Groups FieldValues', () => {
    const groups = parseGroupsFromFieldValues([
      { SystemCode: 'Groups', Value: [{ Id: 9001, Label: 'Step Challenge' }] },
    ]);
    expect(groups).toEqual([{ id: '9001', label: 'Step Challenge' }]);
  });

  it('allows any member when allow-lists are empty', () => {
    expect(assertAllowedGroups([], [], []).ok).toBe(true);
    expect(
      assertAuthorizedMember({ contactId: '1', membershipStatus: 'Active', groups: [] }, [], [])
        .ok,
    ).toBe(true);
  });

  it('allows matching group id or name', () => {
    const groups = [{ id: '9001', label: 'Step Challenge' }];
    expect(assertAllowedGroups(groups, ['9001'], []).ok).toBe(true);
    expect(assertAllowedGroups(groups, [], ['step challenge']).ok).toBe(true);
  });

  it('rejects members outside allow-listed groups', () => {
    const res = assertAllowedGroups([{ id: '9', label: 'Book Club' }], ['9001'], [
      'Step Challenge',
    ]);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/authorized member group/i);
  });

  it('fails closed when admin groups are not configured', () => {
    const member = { contactId: '1', membershipStatus: 'Active', groups: [{ id: '8001', label: 'Board' }] };
    expect(assertAdminMember(member, [], []).ok).toBe(false);
    expect(isAdminMember(member, [], [])).toBe(false);
  });

  it('allows admin members in configured groups', () => {
    const member = { contactId: '1', membershipStatus: 'Active', groups: [{ id: '8001', label: 'Board' }] };
    expect(assertAdminMember(member, ['8001'], []).ok).toBe(true);
    expect(isAdminMember(member, [], ['board'])).toBe(true);
  });

  it('rejects non-admin members for admin gate', () => {
    const member = { contactId: '1', membershipStatus: 'Active', groups: [{ id: '9001', label: 'Step Challenge' }] };
    expect(assertAdminMember(member, ['8001'], ['Board']).ok).toBe(false);
  });

  it('clientMemberView returns only public name and optional admin flag', () => {
    const member = {
      contactId: '1',
      email: 'alex@example.com',
      membershipStatus: 'Active',
      groups: [{ id: '9001', label: 'Step Challenge' }],
      name: 'Alex R.',
    };
    expect(clientMemberView(member, { adminGroupIds: ['8001'] })).toEqual({ name: 'Alex R.' });
    expect(
      clientMemberView(
        { ...member, groups: [{ id: '8001', label: 'Board' }] },
        { adminGroupIds: ['8001'] },
      ),
    ).toEqual({ name: 'Alex R.', isAdmin: true });
  });

  it('toAdminContributors omits email and name parts', () => {
    expect(
      toAdminContributors([
        { contactId: '1', name: 'Alex R.', email: 'a@x', steps: 10, firstName: 'Alex' },
      ]),
    ).toEqual([{ contactId: '1', name: 'Alex R.', steps: 10 }]);
  });
});
