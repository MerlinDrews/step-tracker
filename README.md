# Club Step Counter

Daily step tracker for the AIWCD Walkathon. Members sign in with their Wild Apricot club account, log steps once per day, and see a club total plus a top-10 leaderboard.

| Piece | Role |
|-------|------|
| **GitHub Pages** | Static frontend (totals, logger, leaderboard, admin) |
| **Cloudflare Worker + D1** | API, OAuth code exchange, step storage |
| **Wild Apricot SSO** | Login and membership / group checks |

Live app (example): GitHub Pages URL from this repo. Club site links to it; the tracker is not meant for search indexing (`robots.txt` + `noindex`).

For deeper detail see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/DEPLOY.md](docs/DEPLOY.md).

---

## How members use it

1. Open the hosted tracker URL (from the club site or bookmark).
2. **Club total** is public — no login required.
3. Click **Connect club login** to sign in with Wild Apricot.
4. **Leaderboard** (top 10) is visible to any active club member.
5. **Log steps** is for Walkathon group members only. Pick a day on the calendar (or today), enter steps, save. Re-saving the same day **replaces** that day’s count (no double-counting).
6. Walkathon participants also see **Your total** next to the club total.
7. Club admins (configured WA admin groups) get an **Admin** panel to correct anyone’s daily steps.

**Join the Walkathon** links to the club event page (configurable via `JOIN_URL`).

Display names on the leaderboard are privacy-safe: first name + as much of the last name as needed to stay unique (e.g. `Alex R.`, then `Alex Ri.` / `Alex Re.` if needed). Full last names are not sent to the browser.

---

## Architecture (summary)

```text
Browser (GitHub Pages)
    │  GET/POST ?action=…
    ▼
Cloudflare Worker
    ├── Wild Apricot OAuth + Admin API (groups)
    └── D1 (steps + audit_log)
```

- Session: HMAC token in `sessionStorage` after OAuth; sent in POST body as `sessionToken` (`text/plain` JSON).
- CORS: Worker allows only `FRONTEND_ORIGIN` (and related hosts).
- Shared business rules live in `src/domain/` and are used by the Worker and local mock.

---

## Quick start (local mock)

No Cloudflare or Wild Apricot needed — CSV-backed mock users.

```bash
npm install
npm test
cp config.example.js config.js   # optional overrides
npm run serve
```

Open http://localhost:4173  

- Default view: total + track + leaderboard (`PART: 'all'`).
- Focus one section: `?part=total|leaderboard|track`.
- Use the mock “Sign in as …” buttons.

---

## Production deploy (summary)

Push to `main` runs CI: tests → Worker (migrations + deploy) → GitHub Pages. Pull requests run unit tests only (`.github/workflows/test.yml`).

**GitHub Actions secrets**

| Secret | Purpose |
|--------|---------|
| `WORKER_URL` | Deployed Worker URL |
| `WA_SITE_URL` | Club site origin |
| `CLOUDFLARE_API_TOKEN` | Worker + D1 deploy |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account |

Optional: `JOIN_URL` (defaults to the club Walkathon event page).

**Worker secrets** (set once with `wrangler secret put` — see [docs/DEPLOY.md](docs/DEPLOY.md)):

`WA_CLIENT_ID`, `WA_CLIENT_SECRET`, `WA_ACCOUNT_ID`, `WA_SITE_URL`, `SESSION_SECRET`, `FRONTEND_ORIGIN`, optional `WA_API_KEY`, `ALLOWED_GROUP_*`, `ADMIN_GROUP_*`.

Wild Apricot authorized app → **Trusted redirect domain** = your Pages host (e.g. `you.github.io` or a custom domain).

---

## Project layout

```text
index.html / impressum.html / privacy.html
styles.css, robots.txt, favicons
config.example.js          → copy to config.js (local); CI generates prod config.js
src/app.js                 UI
src/api.js / api.prod.js   Prod API client (Worker)
src/api.local.js           Local CSV API client
src/domain/                Validation, totals, names, membership
src/mock/                  Mock members + handlers
worker/                    Cloudflare Worker + D1 migrations
scripts/dev-server.mjs     Local mock server
tests/
docs/ARCHITECTURE.md
docs/DEPLOY.md
```

---

## Modes

| MODE | When | Behavior |
|------|------|----------|
| `local` | `npm run serve` / default `config.js` | Mock users + `data/steps.csv` |
| `prod` | GitHub Pages (forced) | Worker URL + Wild Apricot SSO |

---

## Unit tests

```bash
npm test
```
