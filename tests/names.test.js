import { describe, expect, it } from 'vitest';
import {
  formatDisplayName,
  parsePersonName,
  toLeaderboardContributors,
  uniqueDisplayNames,
  withPublicNames,
} from '../src/domain/names.js';

describe('parsePersonName', () => {
  it('splits first token from the rest', () => {
    expect(parsePersonName('Alex Rivera')).toEqual({
      firstName: 'Alex',
      lastName: 'Rivera',
    });
    expect(parsePersonName('Alex')).toEqual({ firstName: 'Alex', lastName: '' });
    expect(parsePersonName('Mary Jane Watson')).toEqual({
      firstName: 'Mary',
      lastName: 'Jane Watson',
    });
  });
});

describe('formatDisplayName', () => {
  it('uses a trailing period only while shortened', () => {
    expect(formatDisplayName('Alex', 'Rivera', 1)).toBe('Alex R.');
    expect(formatDisplayName('Alex', 'Rivera', 2)).toBe('Alex Ri.');
    expect(formatDisplayName('Alex', 'Rivera', 6)).toBe('Alex Rivera');
    expect(formatDisplayName('Alex', '', 1)).toBe('Alex');
  });
});

describe('uniqueDisplayNames', () => {
  it('uses one last-name letter when unique', () => {
    const map = uniqueDisplayNames([
      { contactId: '1', firstName: 'Alex', lastName: 'Rivera' },
      { contactId: '2', firstName: 'Jordan', lastName: 'Lee' },
    ]);
    expect(map.get('1')).toBe('Alex R.');
    expect(map.get('2')).toBe('Jordan L.');
  });

  it('lengthens the last-name prefix until unique', () => {
    const map = uniqueDisplayNames([
      { contactId: '1', firstName: 'Alex', lastName: 'Rivera' },
      { contactId: '2', firstName: 'Alex', lastName: 'Reed' },
      { contactId: '3', firstName: 'Alex', lastName: 'Rivers' },
    ]);
    expect(map.get('1')).toBe('Alex Rivera');
    expect(map.get('2')).toBe('Alex Re.');
    expect(map.get('3')).toBe('Alex Rivers');
  });

  it('handles same first name with identical last-name prefixes', () => {
    const map = uniqueDisplayNames([
      { contactId: '1', firstName: 'Sam', lastName: 'Smith' },
      { contactId: '2', firstName: 'Sam', lastName: 'Smythe' },
    ]);
    expect(map.get('1')).toBe('Sam Smi.');
    expect(map.get('2')).toBe('Sam Smy.');
  });

  it('parses full name when parts are missing', () => {
    const map = uniqueDisplayNames([
      { contactId: '1', name: 'Alex Rivera' },
      { contactId: '2', name: 'Alex Reed' },
    ]);
    expect(map.get('1')).toBe('Alex Ri.');
    expect(map.get('2')).toBe('Alex Re.');
  });
});

describe('withPublicNames', () => {
  it('rewrites name and omits name parts from the payload', () => {
    const rows = withPublicNames([
      { contactId: '1', firstName: 'Alex', lastName: 'Rivera', steps: 10, email: 'a@x' },
      { contactId: '2', firstName: 'Alex', lastName: 'Reed', steps: 5, email: 'b@x' },
    ]);
    expect(rows[0]).toEqual({
      contactId: '1',
      steps: 10,
      email: 'a@x',
      name: 'Alex Ri.',
    });
    expect(rows[1].name).toBe('Alex Re.');
    expect(rows[0]).not.toHaveProperty('firstName');
    expect(rows[0]).not.toHaveProperty('lastName');
  });
});

describe('toLeaderboardContributors', () => {
  it('returns only public display name and step total', () => {
    const rows = toLeaderboardContributors([
      { contactId: '1', name: 'Alex R.', steps: 10, email: 'a@x' },
      { contactId: '2', name: 'Jordan L.', steps: 5, email: 'b@x' },
    ]);
    expect(rows).toEqual([
      { name: 'Alex R.', steps: 10 },
      { name: 'Jordan L.', steps: 5 },
    ]);
    expect(rows[0]).not.toHaveProperty('email');
    expect(rows[0]).not.toHaveProperty('contactId');
  });
});
