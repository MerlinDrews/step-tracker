# Club Step Counter

Zero-cost daily step tracker for a Wild Apricot club: members sign in with their club account, log today’s steps, and see all-time cumulative totals.

## Stack

| Piece | Role |
|-------|------|
| Wild Apricot SSO | Login + membership gate |
| Google Sheets | Daily step rows |
| Google Apps Script | OAuth callback + secure Sheet API |
| Static UI (GitHub Pages) | Mobile-friendly logging + leaderboard |

## Wild Apricot widget (primary host)

The app is meant to be pasted into a **Wild Apricot Custom HTML** gadget (max **2,048,000** characters).

```bash
APPS_SCRIPT_URL='https://script.google.com/macros/s/XXX/exec' \
WA_SITE_URL='https://www.aiwcduesseldorf.org' \
npm run build:widget
```

Then open [`dist/aiwcd-step-counter-widget.html`](dist/aiwcd-step-counter-widget.html), select all, copy, and paste into:

**Website → site page → Custom HTML gadget**

Tips:
- Prefer a **members-only** page so only club members see it
- The snippet is self-contained HTML + CSS + JS (no GitHub Pages required for the UI)
- Apps Script still holds OAuth secrets and writes to Google Sheets
- Rebuild whenever you change the app or the Apps Script URL

## Quick start (local mock — no external services)

```bash
cd ~/Repositories/step-counter
npm install
npm test
npm run serve
```

Open http://localhost:4173

`config.js` defaults to `MODE: 'local'`. Local mode uses a small Node server that:

- Mocks auth / membership (Sign in as … buttons)
- **Reads and writes all step entries to [`data/steps.csv`](data/steps.csv)**
- Serves the static UI

Browsers cannot write arbitrary files themselves, so `npm run serve` must be used for local CSV persistence (not a plain static file host).

Sign in as a mock member, save steps, then open `data/steps.csv` to see the rows. Restarting the server reloads from that file.

## Project layout

```
data/steps.csv       Local CSV store (created on first serve if missing)
scripts/dev-server.mjs
src/domain/          Pure logic incl. CSV parse/serialize — unit tested
src/mock/            Shared mock handlers + members
src/api.local.js     Browser client for local CSV API
src/api.mock.js      In-memory mock for unit tests
src/api.js           Switches local vs prod
src/app.js           UI
apps-script/         Code.gs + Domain.gs for production
tests/
config.example.js
```

## Unit tests

```bash
npm test
```

Covers step validation, upsert, totals aggregation, membership rules, date keys, format helpers, CSV round-trip, and the in-memory mock API.

## Production setup

1. **Google Sheet** with a tab named `steps` and headers:
   `date | contactId | email | name | steps | updated_at`

2. **Wild Apricot** → Settings → Apps → Authorized applications → Server application  
   - Enable “Authorize users via Wild Apricot single sign-on”  
   - Trusted redirect domain = your Apps Script web app URL  
   - Note Account ID, Client ID, Client Secret

3. **Apps Script**
   - Create a new project; paste `apps-script/Code.gs` and `apps-script/Domain.gs`
   - Script properties: `WA_CLIENT_ID`, `WA_CLIENT_SECRET`, `WA_ACCOUNT_ID`, `WA_SITE_URL`, `SESSION_SECRET`, `SHEET_ID`, `FRONTEND_ORIGIN`
   - Deploy → Web app → Execute as **Me**, Who has access **Anyone**
   - Copy the web app URL

4. **Frontend (CI → GitHub Pages)**
   - Push to `main` (or run the workflow manually). GitHub Actions runs tests and deploys the static app.
   - Repo **Settings → Pages → Build and deployment → Source: GitHub Actions**
   - Add repository secrets (Settings → Secrets and variables → Actions):
     - `APPS_SCRIPT_URL` — Apps Script web app URL
     - `WA_SITE_URL` — e.g. `https://www.aiwcduesseldorf.org`
   - CI writes production `config.js` from those secrets (never commit secrets)
   - Authorized JavaScript / redirect origins must include your Pages URL, e.g. `https://<user>.github.io` / `https://<user>.github.io/<repo>`

Apps Script + Sheets stay on Google and are deployed separately (paste/update `apps-script/` in the Apps Script editor, or use [`clasp`](https://github.com/google/clasp) later if you want automated backend deploys). The workflow deploys the **frontend** to GitHub Pages.

Workflow file: [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)

## Modes

| MODE | Behavior |
|------|----------|
| `local` | Mock users + CSV file via `npm run serve` (`data/steps.csv`) |
| `prod` | “Sign in with club account” → WA SSO → Apps Script → Sheets |

## Notes

- Wild Apricot does **not** host server-side code; Apps Script holds the client secret.
- “Today” is the browser’s local calendar date (`YYYY-MM-DD`).
- Keep `src/domain/` and `apps-script/Domain.gs` behavior in sync when changing rules.
