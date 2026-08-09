export const CSV_HEADERS = ['date', 'contactId', 'email', 'name', 'steps', 'updated_at'];

function escapeCsvField(value) {
  const s = String(value ?? '');
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function parseCsvLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

/**
 * @param {Array<{date: string, contactId: string|number, email?: string, name?: string, steps: number, updated_at?: string}>} rows
 */
export function rowsToCsv(rows) {
  const lines = [CSV_HEADERS.join(',')];
  for (const row of rows) {
    lines.push(
      [
        row.date,
        row.contactId,
        row.email ?? '',
        row.name ?? '',
        row.steps,
        row.updated_at ?? '',
      ]
        .map(escapeCsvField)
        .join(','),
    );
  }
  return `${lines.join('\n')}\n`;
}

/**
 * @param {string} text
 * @returns {Array<{date: string, contactId: string, email: string, name: string, steps: number, updated_at: string}>}
 */
export function csvToRows(text) {
  const content = String(text || '').replace(/^\uFEFF/, '').trim();
  if (!content) return [];

  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return [];

  const header = parseCsvLine(lines[0]).map((h) => h.trim());
  const idx = Object.fromEntries(CSV_HEADERS.map((h) => [h, header.indexOf(h)]));
  for (const h of CSV_HEADERS) {
    if (idx[h] < 0) {
      throw new Error(`CSV missing required column: ${h}`);
    }
  }

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);
    const date = fields[idx.date] ?? '';
    const contactId = fields[idx.contactId] ?? '';
    if (!date && !contactId) continue;
    rows.push({
      date,
      contactId,
      email: fields[idx.email] ?? '',
      name: fields[idx.name] ?? '',
      steps: Number(fields[idx.steps]) || 0,
      updated_at: fields[idx.updated_at] ?? '',
    });
  }
  return rows;
}
