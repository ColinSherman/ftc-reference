# FTC-Reference — rules for agents

Baseball-Reference-style FTC stats site on Cloudflare Workers (Hono JSX SSR, D1, KV, Queues).
Speed and dense, old-school tables are the product. See README.md for architecture.

## Tables: never require horizontal scrolling

Every table must fit its container **without sideways scrolling at desktop widths (≥ 1024px)**.
The `.scroll` wrapper is a last-resort safety net for phones, not a layout strategy.

When a table gets too wide, fix it in this order:
1. **Merge secondary columns into a primary cell** — e.g. event type + location as a small
   `<div class="sub">` line under the event name; partner/opponent lists as one cell.
2. **Let text columns wrap** — add `class="l wrap"` to name/description cells (`white-space: normal`).
   Long team names are capped with an ellipsis by `.st a.tn`.
3. **Drop low-value columns** or move them to the detail page (a match/team/event page can hold
   the full breakdown; list tables should show only what's needed to compare and click through).
4. **Abbreviate headers** and explain them with `<Th k="…">` / `title=` tooltips (STAT_TIPS).
5. Only for genuinely wide stat grids (season leaderboards, event team-stat tables), keep the
   `.scroll` wrapper — but they must still fit at 1280px.

Before finishing any UI change that touches a table, check it at 1024px and 1280px wide (the
browser pane: `resize_window` + `document.querySelectorAll('.scroll')` comparing
`scrollWidth` to `clientWidth`). Fix any overflow before deploying.

## Other conventions

- **Speed:** server-rendered HTML only; no client framework. Inline CSS/JS lives in
  `apps/web/src/assets.ts`. Pages are edge-cached by `cached()` with KV version keys — bump
  `event:{season}:{code}` in KV whenever data shown on an event/match page changes.
- **Seasons:** all season-specific scoring lives in `packages/seasons/src/descriptors.ts`.
  Never hard-code a season's field names elsewhere; read them through the descriptor.
- **Cloudflare account:** always the personal account `a92ff6c4b72094e5030585f2363b940a`
  (pinned in each `wrangler.jsonc`), never the Team 4201 account.
- **Secrets** (`FTC_API_*`, `ADMIN_TOKEN`, `YOUTUBE_API_KEY`) are set by the user with
  `wrangler secret put` (or, for staging's `ADMIN_TOKEN`, by CI from the `STAGE_ADMIN_TOKEN` repo
  secret); never write or echo them.
- **YouTube quota:** prefer free RSS feeds; `search.list` (100 units) only for channel discovery.
- **Checks before deploy:** `pnpm test`, `pnpm typecheck`, `pnpm lint` must be clean.

## Environments: local → staging → production

Three environments, each with its own data (README "Environments" has the full table). Rules:

- **Staging never touches production resources.** Staging Workers (`ftcref-sync-stage`,
  `ftcref-web-stage`) bind only `ftcref-stage` (D1), `ftcref-stage-cache` (KV) and `ftcref-stage-*`
  queues, under `env.staging` in each `wrangler.jsonc`. Never copy a production id into a staging
  block. `scripts/stage-lib.mjs` (`assertStagingIsolated`) fails CI if you do; keep it passing, and
  extend `boundIds` if you add a new binding type (R2, etc.).
- **New bindings go in both environments.** A new D1/KV/queue/R2 binding or var needs a production
  entry and a separate `ftcref-stage-*` staging entry. Add creation of the staging resource to
  `scripts/stage-resources.mjs`. `vars` and `triggers` are not inherited by `env.staging`, so set them
  there explicitly.
- **Production is written only by `deploy.yml` on merge to `main`.** Don't run `wrangler deploy`,
  `d1 migrations apply ftcref --remote` or `d1 execute ftcref --remote` against production by hand or
  from an agent. Staging scripts may only *read* production (`d1 export`). The `production` GitHub
  Environment only admits `main`, so an approved emergency deploy from a branch needs the owner to add
  that branch to the environment's deployment branches first (and remove it after).
- **Verify on staging first.** Anything that changes stored data (ingest, scoring, corrections,
  migrations) is previewed on stage.ftc-reference.com before merge. Put `stage-resync: 2026/CODE`
  lines in the PR body so staging re-runs those events through the PR's sync code, then check the
  pages there. A note on the page isn't proof; check that the numbers changed.
- **Data fixes are code, not ad-hoc SQL.** Correct bad source data at ingest (e.g. `corrections` in
  the season descriptor) or in a migration, so re-syncs and fresh environments get the same result.
- **Migrations:** staging gets a PR's migrations on push, production on merge, before the new code
  deploys. Old production code runs briefly against the new schema, so keep each migration
  backwards-compatible: add first, drop in a later PR. A weekly refresh (`stage-seed.yml`) resets
  staging to production, after which the next PR push re-applies that PR's migrations.
- **Local is the contributor path.** Fork PRs get no staging deploy (no secrets). Everything must stay
  runnable with `pnpm dev:sync` + `pnpm dev:web` + `scripts/mock-ftc-api.mjs`, with no Cloudflare
  account or FTC API key.

## GitHub Actions: secrets and untrusted code

The repo is public; anyone can open a PR. These rules keep production credentials out of reach of
untrusted code, and `scripts/workflows.test.ts` enforces them in CI:

- **Never use `pull_request_target`** (or `workflow_run` acting on PR code). They run with repo
  secrets on fork PRs. Use `pull_request`, which gives forks no secrets.
- **Cloudflare credentials are environment secrets.** A job that reads `secrets.CLOUDFLARE_API_TOKEN`
  must declare `environment: production` (only `deploy.yml`'s deploy job, `main` only) or
  `environment: staging`. There is no repo-level copy of the token; don't add one.
- **Workflow changes are security changes.** Treat edits to `.github/workflows/`, `scripts/stage-*`
  and anything those scripts run as able to reach Cloudflare. Say so in the PR description.
- Fork PRs are skipped by `stage.yml` (no secrets). Never weaken that `if:` to run fork code with
  secrets; a maintainer can run "Deploy staging" by hand after reading the diff.
