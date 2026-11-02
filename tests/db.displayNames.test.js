import { describe, expect, it } from 'vitest';
import { updateContactDisplayNames } from '../worker/src/db.js';

/**
 * Fake D1 that counts rows matched by UPDATE (D1 rows-written) and supports
 * the GROUP BY used by getContactNameParts.
 */
function makeFakeDb(rows) {
  let writes = 0;
  /** @type {string[]} */
  const updateSql = [];

  const db = {
    prepare(sql) {
      const stmt = {
        _sql: sql,
        _binds: [],
        bind(...args) {
          this._binds = args;
          return this;
        },
        async all() {
          if (!/GROUP BY contact_id/i.test(this._sql)) {
            throw new Error(`unexpected all() sql: ${this._sql}`);
          }
          /** @type {Map<string, object>} */
          const byId = new Map();
          for (const r of rows) {
            const id = String(r.contact_id);
            const prev = byId.get(id);
            if (!prev) {
              byId.set(id, { ...r });
              continue;
            }
            // Mirror SQLite MAX() on text columns.
            if (String(r.name || '') > String(prev.name || '')) prev.name = r.name;
            if (String(r.email || '') > String(prev.email || '')) prev.email = r.email;
            if (String(r.first_name || '') > String(prev.first_name || '')) {
              prev.first_name = r.first_name;
            }
            if (String(r.last_name || '') > String(prev.last_name || '')) {
              prev.last_name = r.last_name;
            }
          }
          return {
            results: [...byId.values()].map((r) => ({
              contact_id: r.contact_id,
              email: r.email || '',
              name: r.name || '',
              first_name: r.first_name || '',
              last_name: r.last_name || '',
            })),
          };
        },
        async run() {
          if (!/UPDATE steps SET name/i.test(this._sql)) {
            throw new Error(`unexpected run() sql: ${this._sql}`);
          }
          updateSql.push(this._sql);
          const [name, contactId] = this._binds;
          const matched = rows.filter(
            (r) =>
              String(r.contact_id) === String(contactId) && String(r.name) !== String(name),
          );
          writes += matched.length;
          for (const r of matched) r.name = name;
          return { success: true, meta: { changes: matched.length, rows_written: matched.length } };
        },
      };
      return stmt;
    },
    async batch(stmts) {
      for (const s of stmts) await s.run();
    },
  };

  return {
    db,
    getWrites: () => writes,
    getUpdateSql: () => updateSql,
  };
}

function seed({ participants, days, nameFor }) {
  const rows = [];
  const start = new Date('2026-09-01T00:00:00Z');
  for (let p = 1; p <= participants; p++) {
    const contactId = String(1000 + p);
    for (let d = 0; d < days; d++) {
      const date = new Date(start);
      date.setUTCDate(start.getUTCDate() + d);
      rows.push({
        date: date.toISOString().slice(0, 10),
        contact_id: contactId,
        name: nameFor(contactId, p),
        email: '',
        first_name: `Person${p}`,
        last_name: 'X',
        steps: 1000,
      });
    }
  }
  return rows;
}

describe('updateContactDisplayNames write scope', () => {
  it('writes zero rows when every stored display name already matches', async () => {
    const rows = seed({
      participants: 100,
      days: 61,
      nameFor: (_id, p) => `Person${p} X.`,
    });
    const desired = new Map(rows.map((r) => [r.contact_id, r.name]));
    const fake = makeFakeDb(rows);

    const contactsQueued = await updateContactDisplayNames(fake.db, desired);

    expect(contactsQueued).toBe(0);
    expect(fake.getWrites()).toBe(0);
    expect(fake.getUpdateSql()).toEqual([]);
  });

  it('only rewrites day rows for contacts whose disambiguated name changed', async () => {
    const rows = seed({
      participants: 50,
      days: 30,
      nameFor: (id) => (id === '1001' || id === '1002' ? 'Alex R.' : `Person${id} X.`),
    });
    // Simulate a new collision forcing longer prefixes for two Alexes.
    const desired = new Map();
    for (const r of rows) {
      if (r.contact_id === '1001') desired.set('1001', 'Alex Ri.');
      else if (r.contact_id === '1002') desired.set('1002', 'Alex Re.');
      else desired.set(r.contact_id, r.name);
    }
    const fake = makeFakeDb(rows);

    const contactsQueued = await updateContactDisplayNames(fake.db, desired);

    expect(contactsQueued).toBe(2);
    expect(fake.getWrites()).toBe(60); // 2 contacts × 30 days
    expect(fake.getUpdateSql().every((sql) => /AND name IS NOT \?/.test(sql))).toBe(true);
  });
});
