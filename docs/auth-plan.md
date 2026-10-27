# Accounts: Better Auth with Google + GitHub

Goal: let people sign in so we can issue API keys and add per-user features later, while
(a) storing as little as possible, since many users are minors, and (b) leaving the public,
edge-cached pages exactly as fast and as shared as they are now.

Out of scope: email/password, Apple, the actual public data API (only the key plumbing ships here),
and replacing `ADMIN_TOKEN` (follow-up: make admin a role on a user).

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Library | Better Auth (`better-auth`, plus `@better-auth/api-key` later) | Runs inside `ftcref-web`, data stays in our D1, has API keys built in |
| Providers | Google, GitHub | Free, cover nearly every student and mentor. Apple needs a $99/yr membership and a JWT secret that must be rotated every ≤6 months |
| Where user data lives | **New D1 `ftcref-auth`** (staging: `ftcref-stage-auth`), bound only to `ftcref-web` as `AUTH_DB` | Keeps PII out of the stats DB. `stage-seed` copies the whole prod stats DB into staging, so a separate DB means real accounts and keys never reach staging. The sync Worker never sees it. Auth queries can't slow down stats queries |
| Session cookie | `ftcref_session`, HttpOnly, Secure, `SameSite=Lax`, 30-day expiry | Lax is needed for the OAuth redirect back. Uses Better Auth's `session.cookieCache` (5 min) so most checks don't touch D1 |
| Public page cache | Never reads the session; never varies by user | The cache key is URL + versions + `stats`/`per` only (`apps/web/src/cache.ts`) |

## What we store (and don't)

Ask providers for the minimum: Google `openid email`, GitHub `read:user` + `user:email`. Better Auth
requires `user:email` on GitHub.

| Table | Keep | Drop or blank |
|---|---|---|
| `user` | id, display handle (GitHub login, or "user-xxxx" for Google; editable), created/updated | **name, image → null** via `mapProfileToUser`. Email: see the open question below |
| `account` | provider id, provider's user id (`sub`), user id | **access/refresh/id tokens.** We never call provider APIs after sign-in, so don't keep them (check for an option to skip storing them; otherwise null them in a DB hook) |
| `session` | token, user id, expiry | **IP address, user agent.** Better Auth records these by default; turn that off (`advanced.ipAddress` / session hooks) |
| `apikey` (PR 2) | hashed key, prefix, user id, name, expiry | — |

**Open question (answer it in the Phase 0 spike):** Better Auth's core `user` table appears to
require a unique `email`. Options, best first:
1. Store a synthetic address that can't be delivered, e.g. `github-12345@users.invalid`, through
   `mapProfileToUser`. Turn off email-based account linking (`account.accountLinking.disableImplicitLinking: true`)
   because the address is fake. The real email is never stored.
2. If (1) fights the library, store the real email and disclose it in the privacy policy.

Prefer (1).

## Phase 0 results (2026-10-26, better-auth 1.7.13)

Spike code: `apps/web/src/auth.ts` (config) and `apps/web/src/auth.test.ts`. The test runs a full
Google and GitHub sign-in against stubbed provider responses on SQLite and prints every row written.

**Storage questions: all solved by configuration**
- **Email.** Better Auth requires `user.email` (unique) and `user.name`. Placeholder emails work:
  `github-{id}@users.invalid` / `google-{sub}@users.invalid` through `mapProfileToUser`. We can also
  stop asking for email at all: GitHub `read:user` only, Google `openid` only (via
  `disableDefaultScope`). Google then never sends an email or name. Better Auth still calls GitHub's
  `/user/emails`, which fails without `user:email`, and sign-in carries on. GitHub's `/user` still
  returns a *public* email if the user set one; we receive it in memory but never store it.
- **Name/avatar.** `name` = GitHub login or `user-{last 6 of sub}` for Google; `image` stays null.
- **Provider tokens.** `databaseHooks.account.create/update.before` nulls `accessToken`,
  `refreshToken` and `idToken`. Verified: the stored `account` row is only provider, provider user
  id, scope and timestamps.
- **IP/UA.** `advanced.ipAddress.disableIpTracking: true` plus a `session.create.before` hook.
  Verified: both are null. **Side effect:** with IP tracking off, Better Auth's built-in rate
  limiter turns itself off completely. Rate-limit `/api/auth/*` with a Workers Rate Limiting
  binding or a WAF rule instead; they key on IP without storing it.
- **Delete account.** `user.deleteUser.enabled` works; user, account and session rows are all gone (cascade).
- **Telemetry** is off by default; pinned `telemetry: { enabled: false }` anyway.
- The cookie cache (`ftcref.session_data`, 5 min) holds the handle and placeholder email, signed
  but not encrypted. It's HttpOnly. `cookieCache.strategy: "jwe"` encrypts it if we want.

**Runtime.** Runs on local workerd with the D1 binding passed straight in (`database: env.AUTH_DB`)
and **without `nodejs_compat`**. Retest that if we add plugins. Schema SQL for the first migration is
what `getMigrations(...).compileMigrations()` prints: tables `user`, `session`, `account`,
`verification`.

**Bundle and startup: over budget for the public Worker**

| `ftcref-web` | Upload | gzip | Startup (local, CPU busy / total) |
|---|---|---|---|
| main today | 222 KiB | 70 KiB | ~9 ms / ~35 ms |
| + Better Auth, lazy `import()` | 1002 KiB | 284 KiB | ~24 ms / ~75 ms |

The extra code is kysely (193 KiB), better-auth (192), @better-auth/core (133), zod (105) and jose (48).
A lazy `import()` doesn't help: wrangler builds one file, so every cold isolate still parses all
of it, even for a team page. The threshold was 150 KiB gzipped, and this is +214.

**Change to the plan: put auth in its own Worker.** Add `ftcref-account` (staging `ftcref-account-stage`),
which owns Better Auth, `AUTH_DB`, `/api/auth/*`, `/login`, `/account` and later `/api/v1/*`.
`ftcref-web` forwards those paths over a **service binding** (`ACCOUNT`), which adds almost no
latency, and doesn't include a single byte of Better Auth. This also makes the cache rule
structural: the public Worker can't read sessions because it has no auth code and no `AUTH_DB`
binding. Costs: one more Worker in `deploy.yml`/`stage.yml`, and a `services` binding type for
`boundIds` in `stage-lib.mjs` (staging must bind only `ftcref-account-stage`).

## Phase 0: spike (done, see results above)

- Add `better-auth` to `apps/web` and `"compatibility_flags": ["nodejs_compat"]` to both
  environments in `apps/web/wrangler.jsonc`.
- Measure the bundle and cold start before and after (`wrangler deploy --dry-run --outdir`).
  Stop and reconsider (Arctic plus our own sessions) if it adds more than ~150 KB gzipped, or if
  public pages get measurably slower. Public routes must not import the auth module's heavy paths;
  load it lazily inside `/api/auth`, `/login` and `/account` only.
- Confirm the `email` question above, how to skip storing tokens, IP and UA, and what
  `npx auth@latest generate` emits for SQLite.

## Phase 1, PR 1: sign-in and account page (privacy update ships in the same PR)

> After Phase 0: the auth code, `AUTH_DB` and the account routes below move to a new `apps/account`
> Worker. `apps/web` only gets an `ACCOUNT` service binding and a forwarder for `/api/auth/*`,
> `/login` and `/account*`. Rate limiting is a Workers Rate Limiting binding, not Better Auth's.

**Infra**
- `apps/web/wrangler.jsonc`: production `AUTH_DB` → `ftcref-auth`; `env.staging` `AUTH_DB` →
  `ftcref-stage-auth`. Each gets `migrations_dir: ../../packages/db/auth-migrations`. Add vars
  `AUTH_URL` (`https://ftc-reference.com` / `https://stage.ftc-reference.com`).
- `scripts/stage-resources.mjs`: create `ftcref-stage-auth` if it's missing.
- `scripts/stage-lib.mjs` (`assertStagingIsolated`): it currently requires every staging D1 to be
  named `ftcref-stage`. Allow any `ftcref-stage-*` name, keep the "not bound in production" check,
  and add a test case.
- Migrations: commit the SQL from `npx auth generate` as `packages/db/auth-migrations/0001_auth.sql`.
  Never use Better Auth's runtime migration endpoint. Add `db:migrate:auth:stage` and
  `db:migrate:auth:remote` scripts, wired into `stage.yml` and `deploy.yml` next to the existing
  migrate steps. **Workflow change: say so in the PR description.**
- `stage-seed.mjs` needs no change: it never touches `AUTH_DB`. Add a comment there saying so.
- Secrets per environment, set by Colin with `wrangler secret put` (never by an agent):
  `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID`,
  `GITHUB_CLIENT_SECRET`. Make separate OAuth apps for production and staging; their callbacks are
  `{AUTH_URL}/api/auth/callback/{google|github}`. A provider is enabled only when its secrets are set.

**Code**
- `apps/web/src/env.ts`: add `AUTH_DB`, `AUTH_URL` and the secrets to `Env`.
- `apps/web/src/auth.ts` (new): `getAuth(env)` builds Better Auth once per isolate:
  `database: env.AUTH_DB`, `baseURL: env.AUTH_URL`, `trustedOrigins: [env.AUTH_URL]`,
  `emailAndPassword` off (outside local, see below), social providers, `mapProfileToUser` (as in
  "What we store"), cookie name and prefix, cookie cache, built-in rate limit on auth endpoints.
  Also exports `requireUser(c)` middleware (`auth.api.getSession({ headers })`, then 401 or
  redirect to `/login`).
- `apps/web/src/routes/account.tsx` (new), all `Cache-Control: private, no-store`, all noindex:
  - `app.on(["GET","POST"], "/api/auth/*", c => getAuth(c.env).handler(c.req.raw))`
  - `GET /login`: "Continue with Google" / "Continue with GitHub" as plain `<form method="post">` buttons
    (no client JS), plus a line: "You must be 13 or older to create an account. Browsing never
    needs one."
  - `GET /account`: handle (editable), linked providers, Sign out, **Delete account** (hard-deletes
    the user, accounts, sessions and keys; required for minimal data).
- `apps/web/src/index.tsx`: mount the routes. Session middleware is attached **only** to
  `/account*` and (in PR 2) `/api/v1/*`, never `*`.
- Header (`views/layout.tsx`): a static `Sign in` link to `/account`. `/account` redirects
  signed-out visitors to `/login`. The markup is the same for every visitor, so cached pages stay
  shared. (Optional later: a non-HttpOnly `ftcref_in=1` hint cookie and a few bytes of inline JS
  that relabel it "Account". No PII, still cache-safe.)
- `seoTags.ts` robots: add `Disallow: /api/`, `/account`, `/login`.

**Cache guardrails (with tests)**
- `cached()`: refuse to store any response that has `Set-Cookie`, or whose `Cache-Control`
  includes `private`/`no-store`. This is defensive, so a future mistake can't put a user's page
  in the shared cache.
- Test: a public page requested with and without a `ftcref_session` cookie produces the same cache
  key, and `getSession` is never called. A spy on the auth module checks this.
- Test: `/account`, `/login` and `/api/auth/*` responses carry `private, no-store`.

**Local contributor path (no OAuth apps, no Cloudflare account)**
- When `ENV_NAME` is unset (local), enable Better Auth `emailAndPassword` and show a "Dev sign-in"
  form on `/login`. Add a test asserting it is off whenever `ENV_NAME` is `staging`/`production`.
- `--persist-to` already gives local D1 state. Add `db:migrate:auth:local` and document it in the
  README next to the existing dev steps.

**Privacy and terms (`routes/legal.tsx`)**: list exactly what an account stores (table above), that
browsing needs no account, the 13+ rule, that sign-in goes through Google/GitHub (their policies
apply), how to delete your account, and the `ftcref_session` cookie.

**Data retention**: expired sessions are deleted on a schedule. The web Worker has no cron today,
so add a daily `triggers.crons` entry in both environments (vars and triggers aren't inherited by
staging) that deletes expired sessions and keys from `AUTH_DB`.

## Phase 2, PR 2: API keys

- Add `@better-auth/api-key`: `apiKey()` plugin, key prefix `ftcr_`, and a migration
  `0002_apikey.sql`.
- `/account`: list keys (name, prefix, created, last used, expiry), create (shown once), revoke.
  Cap keys per user (e.g. 5).
- `/api/v1/*` middleware: read `Authorization: Bearer ftcr_…` (the plugin verifies from the body,
  so extracting the key from the header is our code), then call `auth.api.verifyApiKey`.
  Ship one endpoint, `GET /api/v1/me`, to prove the plumbing.
- **Check D1 writes**: find out whether `verifyApiKey` writes on every call (last-used, remaining
  count, rate-limit counters). If it does, turn off the plugin's rate limiting and counters, and
  rate-limit with the Workers Rate Limiting binding instead. Keep "last used" to at most one write
  per key per hour, to stay in line with the recent D1-write cuts.

## Verify before merge (both PRs)

- `pnpm test`, `pnpm typecheck`, `pnpm lint`.
- Local: dev sign-in → account → delete account works with no OAuth apps configured.
- Staging (stage.ftc-reference.com, staging OAuth apps): sign in with Google and with GitHub; check
  the rows in `ftcref-stage-auth` contain only the fields in the table above (no name, image,
  tokens, IP or UA). Delete the account, then check the rows are gone.
- Cache isolation on staging: fetch a team page signed in and signed out and compare the bodies;
  `cf-cache-status` should be `HIT` for the second request either way.
- Bundle size and public-page latency compared with Phase 0 numbers.
- Header still fits at 1024px and 1280px.

## Follow-ups (not in these PRs)

- Admin as a user role, retiring the `ADMIN_TOKEN` cookie.
- Public data API endpoints behind the keys.
- Per-user features (followed teams, saved filters), rendered client-side or on uncached routes only.
