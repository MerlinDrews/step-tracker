import { describe, expect, it } from 'vitest';
import { csvToRows, rowsToCsv } from '../src/domain/csv.js';

describe('csv', () => {
  const rows = [
    {
      date: '2026-08-08',
      contactId: '1001',
      email: 'alex@example.com',
      name: 'Alex Rivera',
      steps: 8200,
      updated_at: '2026-08-08T10:00:00.000Z',
    },
    {
      date: '2026-08-09',
      contactId: '1002',
      email: 'jordan@example.com',
      name: 'Jordan, Lee',
      steps: 1000,
      updated_at: 't1',
    },
  ];

  it('round-trips rows through CSV', () => {
    const csv = rowsToCsv(rows);
    expect(csv.startsWith('date,contactId,email,name,steps,updated_at')).toBe(true);
    expect(csvToRows(csv)).toEqual(rows);
  });

  it('escapes commas in names', () => {
    const csv = rowsToCsv(rows);
    expect(csv).toContain('"Jordan, Lee"');
  });

  it('returns empty array for blank input', () => {
    expect(csvToRows('')).toEqual([]);
    expect(csvToRows('   ')).toEqual([]);
  });

  it('throws when a required column is missing', () => {
    expect(() => csvToRows('date,contactId,email\n2026-08-08,1,a@ex.com\n')).toThrow(/missing/i);
  });
});
