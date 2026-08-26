# Club Step Counter

Zero-cost daily step tracker for a Wild Apricot club.

**Important:** Wild Apricot’s page CSP blocks `script.googleusercontent.com`, so the Custom HTML gadget **cannot** call Google Apps Script. The WA gadget is a **launcher**. The interactive app (total, leaderboard, step logging, SSO) runs on **GitHub Pages** (or any static host).

| Surface | Where | What it does |
|---------|--------|--------------|
| **WA embed** | Club site Custom HTML | Shows CTAs → opens hosted tracker |
| **Hosted app** | GitHub Pages | Club + personal totals, top-10 leaderboard, Walkathon logger + WA SSO |
| **Cloudflare Worker** | Cloudflare | D1 API + OAuth code exchange (replaces Apps Script) |

## Stack

| Piece | Role |
|-------|------|
| Wild Apricot SSO | Login + membership / group gates |
| Cloudflare Worker + D1 | Step storage (upsert per day) + API |
| GitHub Pages | Interactive frontend |
| WA Custom HTML | Pasteable launcher gadget only |

Legacy **Apps Script + Sheets** is deprecated — see [docs/CLOUDFLARE-MIGRATION.md](docs/CLOUDFLARE-MIGRATION.md).

## 1) Hosted app (GitHub Pages)

Deploy this repo to GitHub Pages (workflow in `.github/workflows/deploy.yml`).  
`config.js` on Pages uses `MODE: 'prod'` and `WORKER_URL` (Cloudflare Worker).

Open the Pages URL, use **Connect club login**, then leaderboard / logging.

Set Worker secret `FRONTEND_ORIGIN` to that Pages origin (e.g. `https://you.github.io/step-counter`).

Wild Apricot authorized app → **Trusted redirect domain** = the Pages host (e.g. `you.github.io`).

### Worker deploy

```bash
npm install
# Edit wrangler.toml with your D1 database_id
npm run worker:migrate
npm run worker:deploy
```

Set GitHub secret `WORKER_URL` to the deployed Worker URL.

## 2) Wild Apricot launcher widget

```bash
APPS_SCRIPT_URL='https://script.google.com/macros/s/XXX/exec' \
WA_SITE_URL='https://www.aiwcduesseldorf.org' \
APP_URL='https://you.github.io/step-tracker/' \
npm run build:widget
```

Paste [`dist/aiwcd-steps-widget.html`](dist/aiwcd-steps-widget.html) into **one** Custom HTML gadget.

The gadget is a **launcher only** (not the full app): it may show the public club total (baked at build time / live if the browser allows), plus **Go to the step tracker** → `APP_URL`.

## Quick start (local mock — no external services)

```bash
cd ~/Repositories/step-counter
npm install
npm test
npm run serve
```

Open http://localhost:4173 — default `PART` is `all`. Focus one surface with `?part=total|leaderboard|track`.

`config.js` defaults to `MODE: 'local'` (CSV mock via `npm run serve`).

## Project layout

```
data/steps.csv       Local CSV store (created on first serve if missing)
scripts/dev-server.mjs
scripts/build-widget.mjs
src/domain/          Pure logic — unit tested
src/mock/            Shared mock handlers + members
src/api.local.js     Browser client for local CSV API
src/api.mock.js      In-memory mock for unit tests
src/api.prod.js      Apps Script client (fetch GET public + POST authenticated)
src/api.widget.js    Widget build entry (prod-only)
src/app.js           UI
apps-script/         Code.gs + Domain.gs for production
tests/
config.example.js
```

## Unit tests

```bash
npm test
```

## Production setup

1. **Google Sheet** with a tab named `steps` and headers:
   `date | contactId | email | name | steps | updated_at`

2. **Wild Apricot** → Settings → Apps → Authorized applications → Server application  
   - Enable “Authorize users via Wild Apricot single sign-on”  
   - **Trusted redirect domain** = your **GitHub Pages host** (e.g. `you.github.io`)  
   - Note Account ID, Client ID, Client Secret  

3. **Apps Script**
   - Paste `apps-script/Code.gs` and `apps-script/Domain.gs` (redeploy after changes)
   - Script properties: `WA_CLIENT_ID`, `WA_CLIENT_SECRET`, `WA_ACCOUNT_ID`, `WA_SITE_URL`, `SESSION_SECRET`, `SHEET_ID`, `FRONTEND_ORIGIN` (= Pages origin), optional `ALLOWED_GROUP_*`, optional `ADMIN_GROUP_*`, optional `WA_API_KEY`  
   - **`WA_API_KEY`:** create under WA Settings → Apps → API keys if you use Walkathon **group** allow-lists (`ALLOWED_GROUP_*`). The SSO app’s client id/secret often cannot use `client_credentials`. Without an API key, login still works for the leaderboard (Active members); group enrichment is skipped.
   - Deploy → Web app → Execute as **Me**, Who has access **Anyone**

4. **GitHub Pages**
   - Secrets: `APPS_SCRIPT_URL`, `WA_SITE_URL` (optional `JOIN_URL`, `APP_URL` for widget artifact)
   - Members use the Pages URL for leaderboard + logging

5. **WA launcher**
   - Build widget with `APP_URL` = Pages URL, paste into one Custom HTML gadget

6. **Group allow-list (track only)**
   - `ALLOWED_GROUP_IDS` and/or `ALLOWED_GROUP_NAMES`
   - If both empty, any **Active** member can log steps
   - Leaderboard requires Active membership only
   - Public total needs no auth and never returns contributor names

### API actions

| Action | Auth | Response |
|--------|------|----------|
| `public_config` | None | `{ waClientId, waAccountId, waSiteUrl }` |
| `public_total` | None | `{ totalSteps }` |
| `auth_exchange` | OAuth `code` (POST) | `{ sessionToken, member }` |
| `leaderboard` | Active member session | `{ totals: { totalSteps, contributors }, member }` |
| `me` / `log` | Active + group allow-list | Member day history / upsert |
| `admin_set_steps` | Admin WA group | Override steps for any `contactId` + date |
| `admin_contributors` | Admin WA group | Participant list for admin picker |

Public reads (`public_total`, `public_config`) use GET. Authenticated actions use POST with `sessionToken` in a `text/plain` JSON body (no `Authorization` header — Apps Script does not answer CORS preflight). Session tokens are never sent in URL query strings.

### Performance (Apps Script)

The backend caches aggregated totals (~2 min) and row data (~1 min), upserts **one sheet row** per log instead of rewriting the tab, and uses `LockService` for concurrent writes. After redeploying `Code.gs`, run **`installWarmCacheTrigger()`** once from the Apps Script editor to poll `public_total` every 5 minutes and reduce cold-start latency.

### Admin manual edits

Configure Wild Apricot admin groups in Script properties:

- `ADMIN_GROUP_NAMES` — e.g. `Board`, `Step Challenge Organizers` (case-insensitive)
- `ADMIN_GROUP_IDS` — optional numeric group ids

Admins signed in via WA see an **Admin — edit participant steps** panel in the hosted app. They can also edit the Google Sheet directly; cached reads may lag up to ~2 minutes.

See [docs/CLOUDFLARE-MIGRATION.md](docs/CLOUDFLARE-MIGRATION.md) for the planned move to Cloudflare Workers + D1 (including CSV export/import for spreadsheet-style bulk edits).

## Modes

| MODE | Behavior |
|------|----------|
| `local` | Mock users + CSV via `npm run serve` |
| `prod` (Pages) | Full tracker + WA SSO via Apps Script |
| `prod` embed (WA) | Launcher only → `APP_URL` |

## Notes

- Wild Apricot does **not** host server-side code; Apps Script holds the client secret.
- Group membership is read via the Admin API (`/contacts/{id}` FieldValues `Groups`) because `/contacts/me` often omits it.
- “Today” is the browser’s local calendar date (`YYYY-MM-DD`).
- Keep `src/domain/` and `apps-script/Domain.gs` behavior in sync when changing rules.
