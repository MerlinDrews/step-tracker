# Club Step Counter

Zero-cost daily step tracker for a Wild Apricot club — standalone web app on GitHub Pages with a Cloudflare Worker + D1 backend.

| Piece | Role |
|-------|------|
| **GitHub Pages** | Hosted app: club + personal totals, top-10 leaderboard, Walkathon step logging |
| **Cloudflare Worker + D1** | Step storage (upsert per day) + API + OAuth code exchange |
| **Wild Apricot SSO** | Login + membership / group gates |

## Quick start (local mock)

```bash
npm install
npm test
npm run serve
```

Open http://localhost:4173 — default view is `all` (total + track + leaderboard). Focus one section with `?part=total|leaderboard|track`.

Copy `config.example.js` to `config.js` for local overrides. Default `MODE` is `local` (CSV mock via `npm run serve`).

## Production deploy

Push to `main` triggers CI: unit tests → Worker deploy → GitHub Pages.

### GitHub secrets

| Secret | Purpose |
|--------|---------|
| `WORKER_URL` | Deployed Cloudflare Worker URL |
| `WA_SITE_URL` | Club site origin, e.g. `https://www.aiwcduesseldorf.org` |
| `CLOUDFLARE_API_TOKEN` | Worker + D1 deploy |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account |

Optional: `JOIN_URL` for Walkathon join link in the track CTA.

### Worker setup

```bash
npm install
# Edit wrangler.toml with your D1 database_id
npm run worker:migrate
npm run worker:deploy
```

Set Worker secrets via `wrangler secret put` (see [docs/CLOUDFLARE-MIGRATION.md](docs/CLOUDFLARE-MIGRATION.md)):

- `WA_CLIENT_ID`, `WA_CLIENT_SECRET`, `WA_ACCOUNT_ID`, `WA_SITE_URL`
- `SESSION_SECRET`, `FRONTEND_ORIGIN` (= your Pages origin)
- Optional: `ALLOWED_GROUP_*`, `ADMIN_GROUP_*`, `WA_API_KEY`

Wild Apricot authorized app → **Trusted redirect domain** = your GitHub Pages host (e.g. `you.github.io`).

Members open the Pages URL, sign in with club login, then log steps and view the leaderboard.

## Project layout

```
data/steps.csv       Local CSV store (created on first serve if missing)
scripts/dev-server.mjs
src/domain/          Pure logic — unit tested
src/mock/            Shared mock handlers + members
src/api.local.js     Browser client for local CSV API
src/api.mock.js      In-memory mock for unit tests
src/api.prod.js      Cloudflare Worker client
src/app.js           UI
worker/              Cloudflare Worker + D1 schema
tests/
config.example.js
```

## API actions

| Action | Auth | Response |
|--------|------|----------|
| `public_config` | None | `{ waClientId, waAccountId, waSiteUrl }` |
| `public_total` | None | `{ totalSteps }` |
| `auth_exchange` | OAuth `code` (POST) | `{ sessionToken, member }` |
| `leaderboard` | Active member | `{ totals, personalTotal?, canTrack? }` |
| `me` / `log` | Active + Walkathon group | Member day history / upsert |
| `admin_set_steps` | Admin WA group | Override steps for any participant + date |
| `admin_contributors` | Admin WA group | Participant list for admin picker |

Public reads use GET. Authenticated actions use POST with `sessionToken` in a `text/plain` JSON body.

## Admin panel

Configure Wild Apricot admin groups in Worker secrets:

- `ADMIN_GROUP_NAMES` — e.g. `Board`, `Step Challenge Organizers`
- `ADMIN_GROUP_IDS` — optional numeric group ids

Admins signed in via WA see **Admin — edit participant steps** in the hosted app.

## Modes

| MODE | Behavior |
|------|----------|
| `local` | Mock users + CSV via `npm run serve` |
| `prod` (Pages) | Full tracker + WA SSO via Cloudflare Worker |

## Notes

- Wild Apricot does **not** host server-side code; the Worker holds the client secret.
- Group membership is read via the Admin API because `/contacts/me` often omits it.
- “Today” is the browser’s local calendar date (`YYYY-MM-DD`).
- See [docs/CLOUDFLARE-MIGRATION.md](docs/CLOUDFLARE-MIGRATION.md) for migration notes and CSV import/export plans.

## Unit tests

```bash
npm test
```
