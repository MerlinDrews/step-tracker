import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { csvToRows, rowsToCsv } from '../src/domain/csv.js';
import { createMockHandlers } from '../src/mock/handlers.js';
import { defaultSeedRows } from '../src/mock/members.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CSV_PATH = path.join(ROOT, 'data', 'steps.csv');
const PORT = Number(process.env.PORT || 4173);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

/** @type {Map<string, object>} */
const sessions = new Map();

async function ensureCsv() {
  await fs.mkdir(path.dirname(CSV_PATH), { recursive: true });
  try {
    await fs.access(CSV_PATH);
  } catch {
    await fs.writeFile(CSV_PATH, rowsToCsv(defaultSeedRows()), 'utf8');
    console.log(`Created ${CSV_PATH}`);
  }
}

async function loadRows() {
  const text = await fs.readFile(CSV_PATH, 'utf8');
  return csvToRows(text);
}

async function saveRows(rows) {
  await fs.writeFile(CSV_PATH, rowsToCsv(rows), 'utf8');
}

function createRequestStorage(req) {
  const auth = req.headers.authorization || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : '';

  return {
    loadRows,
    saveRows,
    getSession: () => {
      if (!bearer || !sessions.has(bearer)) {
        return { token: null, member: null };
      }
      return { token: bearer, member: sessions.get(bearer) };
    },
    setSession: ({ token, member }) => {
      if (bearer && (!token || token !== bearer)) {
        sessions.delete(bearer);
      }
      if (token && member) {
        sessions.set(token, member);
      }
    },
  };
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(payload);
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return {};
  }
}

async function handleApi(req, res, url) {
  const handlers = createMockHandlers(createRequestStorage(req));
  const route = url.pathname.replace(/^\/api/, '') || '/';

  if (req.method === 'GET' && route === '/public-total') {
    return sendJson(res, 200, await handlers.getPublicTotal());
  }
  if (req.method === 'GET' && route === '/leaderboard') {
    const result = await handlers.getLeaderboard();
    return sendJson(res, result.ok ? 200 : result.error === 'Not signed in' ? 401 : 403, result);
  }
  if (req.method === 'GET' && route === '/me') {
    const result = await handlers.getMe(url.searchParams.get('date') || undefined);
    const status = result.ok ? 200 : result.error === 'Not signed in' ? 401 : 403;
    return sendJson(res, status, result);
  }
  if (req.method === 'GET' && route === '/mock-users') {
    return sendJson(res, 200, { ok: true, users: handlers.listMockUsers() });
  }
  if (req.method === 'POST' && route === '/login') {
    const body = await readJson(req);
    const result = await handlers.loginAs(body.userId);
    return sendJson(res, result.ok ? 200 : 403, result);
  }
  if (req.method === 'POST' && route === '/logout') {
    await handlers.logout();
    return sendJson(res, 200, { ok: true });
  }
  if (req.method === 'POST' && route === '/log') {
    const body = await readJson(req);
    const result = await handlers.logSteps(body.steps, body.date);
    const status = result.ok ? 200 : result.error === 'Not signed in' ? 401 : 400;
    return sendJson(res, status, result);
  }
  if (req.method === 'POST' && route === '/admin/set-steps') {
    const body = await readJson(req);
    const result = await handlers.adminSetSteps(body.contactId, body.steps, body.date, {
      name: body.name,
      email: body.email,
    });
    const status = result.ok ? 200 : result.error === 'Not signed in' ? 401 : 403;
    return sendJson(res, status, result);
  }
  if (req.method === 'POST' && route === '/admin/contributors') {
    const result = await handlers.adminContributors();
    const status = result.ok ? 200 : result.error === 'Not signed in' ? 401 : 403;
    return sendJson(res, status, result);
  }

  return sendJson(res, 404, { ok: false, error: 'Unknown API route' });
}

function safeJoin(root, requestPath) {
  const decoded = decodeURIComponent(requestPath.split('?')[0]);
  const cleaned = decoded === '/' ? '/index.html' : decoded;
  const resolved = path.normalize(path.join(root, cleaned));
  if (!resolved.startsWith(root)) return null;
  return resolved;
}

async function handleStatic(req, res, url) {
  const filePath = safeJoin(ROOT, url.pathname);
  if (!filePath) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  try {
    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
}

await ensureCsv();

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    if (url.pathname.startsWith('/api/')) {
      return await handleApi(req, res, url);
    }
    return await handleStatic(req, res, url);
  } catch (err) {
    console.error(err);
    sendJson(res, 500, { ok: false, error: 'Server error' });
  }
});

server.listen(PORT, () => {
  console.log(`Step Counter local server: http://localhost:${PORT}`);
  console.log(`CSV data file: ${CSV_PATH}`);
});
