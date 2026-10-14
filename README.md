# FTC-Reference

Fast, dense FIRST Tech Challenge stats and scouting, styled like Baseball-Reference and built on Cloudflare (personal account `a92ff6c4…`).

## Layout

| Path | What it is |
|---|---|
| `packages/db/migrations` | D1 schema (hand-written SQL, `STRICT` tables). Scores and stats live in season-keyed generic tables (`match_scores`, `team_event_stats`, `team_season_stats`); raw API JSON is kept per alliance. |
| `packages/ftc-api` | Typed FTC Events API client: Basic auth, `If-Modified-Since`, an HTML-instead-of-JSON guard, and retry/backoff. |
| `packages/seasons` | One descriptor per season, from SKYSTONE (2019) to BIOBUZZ (2026). Each defines the point formulas (auto/endgame/no-penalty/total/penalties), four headline OPR components (`c1`..`c4`) and the match breakdown rows. Adding a season means adding one descriptor. |
| `packages/stats` | OPR via ridge-regularised least squares (Cholesky). |
| `apps/sync` | `ftcref-sync` Worker: cron planner → Queue → jobs that write D1, archive raw responses to R2, and bump cache versions in KV. |
| `apps/web` | `ftcref-web` Worker: Hono JSX server-rendered HTML, near-zero client JS, version-keyed edge cache. |
| `scripts/mock-ftc-api.mjs` | Local mock of the FTC API (one synthetic BIOBUZZ event) for end-to-end testing. |

## How sync works

The FTC API has no webhooks, so we poll, and poll cheaply.

**Cron schedule**
- **Every minute:** the planner picks the events that are due:
  - live, with changes in the last 20 minutes: every minute;
  - live but quiet: every 5 minutes;
  - ended within the last 2 days: hourly.
- **Every 6 hours:** events and leagues.
- **Daily at 09:30 UTC:** teams, plus a forced re-sync of every event from the last 30 days.

**Event jobs**
- Each event job first asks for the qual and playoff hybrid schedules with `If-Modified-Since`.
- If both come back 304, the job stops: 2 requests and about 10 ms.
- Otherwise it fetches scores, rankings, teams and alliances, upserts everything, recomputes OPR and stats for the event, then bumps `event:{season}:{code}` in KV.
- `Last-Modified` values are saved only after the data is written, so a failed write gets retried.

**Observability:** `GET /admin/runs` on the sync Worker shows the last 100 jobs: requests made, 304 count, rows written and time taken.

## Seasons and backfill

Every season since 2019 is loaded through the same pipeline. Historical seasons go through their own queue (`ftcref-backfill`), throttled to about 4 requests per second per consumer, so live polling of the current season never waits behind them.

A per-minute state machine in `apps/sync/src/backfill.ts` processes seasons one at a time, newest first:

1. Queue the season's events, teams and leagues.
2. Once events have landed, queue matches and awards for every competition event.
3. Once the queue has been quiet for 5 minutes, mark the season done.

`/admin/status` shows progress. `POST /admin/backfill?season=YYYY` restarts a season. Both use the admin bearer token.

Remote events (2020–21) have one team per match. They are stored with the team number in `matches.series`, and their match URLs look like `q3t12345`.

## Local development

```bash
pnpm install
pnpm db:migrate:local
cp apps/sync/.dev.vars.example apps/sync/.dev.vars   # set FTC_API_BASE=http://localhost:8790/v2.0 to use the mock
node scripts/mock-ftc-api.mjs                         # terminal 1
pnpm dev:sync                                         # terminal 2 (:8787)
pnpm dev:web                                          # terminal 3 (:8788); apps/web/.dev.vars DEV=1 bypasses the HTML cache
curl -X POST -H "Authorization: Bearer dev-admin-token" localhost:8787/admin/backfill
curl -X POST -H "Authorization: Bearer dev-admin-token" "localhost:8787/admin/backfill?step=matches"
curl "localhost:8787/__scheduled?cron=*+*+*+*+*"     # run the per-minute planner
```

`pnpm test` runs the unit tests, `pnpm typecheck` runs the type checker, and `pnpm lint` runs Biome.

## First deploy (personal Cloudflare account)

1. Run `npx wrangler whoami` and make sure account `a92ff6c4b72094e5030585f2363b940a` is listed.
2. Create the resources:
   - `wrangler d1 create ftcref`
   - `wrangler kv namespace create CACHE_VER`
   - `wrangler r2 bucket create ftcref-raw`
   - `wrangler queues create ftcref-sync-jobs`
   - `wrangler queues create ftcref-sync-dlq`
3. Put the D1 and KV IDs into both `apps/*/wrangler.jsonc` files (replace the `REPLACE_WITH_*` placeholders).
4. Run `pnpm db:migrate:remote`.
5. Set the sync Worker's secrets with `wrangler secret put` (from `apps/sync`): `FTC_API_USER`, `FTC_API_TOKEN`, `ADMIN_TOKEN`. Register for an API token at <https://ftc-events.firstinspires.org/services/API/register>.
6. Run `pnpm deploy`, then start the backfill: `POST /admin/backfill`, followed by `POST /admin/backfill?step=matches`.
7. Attach a custom domain to `ftcref-web`. `caches.default` doesn't run on `*.workers.dev`, so pages aren't edge-cached until you do.

## Data terms

Data comes from the FIRST Tech Challenge Events API. Use is non-commercial only, every page links back to the API page (in the footer), and the token must never be committed.
