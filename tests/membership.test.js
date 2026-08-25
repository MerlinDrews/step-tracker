import { describe, expect, it } from 'vitest';
import {
  assertActiveMember,
  assertAllowedGroups,
  assertAuthorizedMember,
  assertSession,
  parseAllowList,
  parseGroupsFromFieldValues,
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
});
