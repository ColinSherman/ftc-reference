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
  `wrangler secret put`; never write or echo them.
- **YouTube quota:** prefer free RSS feeds; `search.list` (100 units) only for channel discovery.
- **Checks before deploy:** `pnpm test`, `pnpm typecheck`, `npx biome check .` must be clean.
- **Deploy:** `wrangler deploy` from `apps/sync` and `apps/web` (D1 migrations first:
  `wrangler d1 migrations apply ftcref --remote` from `apps/sync`).
