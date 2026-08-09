import { describe, expect, it } from 'vitest';
import { assertActiveMember, assertSession } from '../src/domain/membership.js';

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
});
