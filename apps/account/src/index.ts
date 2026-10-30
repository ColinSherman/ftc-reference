import { Hono } from "hono";
import { type Auth, authFor, DEV_USER, isAdminAccount, isLocal, providers } from "./auth";
import type { Env } from "./env";
import { createKey, deleteKeysOf, listKeys, revokeKey, touchKey, verifyKey } from "./keys";

/**
 * ftcref-account: sign-in, sessions and account data. It has no public URL; ftcref-web forwards
 * `/api/auth/*` and `/api/account/*` here over its ACCOUNT service binding and renders the HTML
 * pages itself. Keeping Better Auth out of ftcref-web keeps the public Worker small, and means it
 * can't put a signed-in page in the shared edge cache.
 *
 * `/api/auth/*` is Better Auth (OAuth redirects and callbacks). `/api/account/*` is ours: plain form
 * posts from the web pages, answered with 303 redirects, plus `me` for the account page.
 * `/internal/*` answers ftcref-web only (it never forwards those paths): `verify-key` checks API keys
 * for `/api/v1`, and `whoami` says whether a session cookie belongs to an admin. Each answer only
 * tells the caller about the key or cookie it already holds.
 */
type Ctx = { Bindings: Env; Variables: { auth: Auth } };
const app = new Hono<Ctx>();

const PRIVATE = { "Cache-Control": "private, no-store" };

app.use("*", async (c, next) => {
  await next();
  c.res.headers.set("Cache-Control", PRIVATE["Cache-Control"]);
});

// Per-IP limit on anything that writes (sign-in starts, callbacks, account changes).
app.use("*", async (c, next) => {
  const writes = c.req.method === "POST" || c.req.path.startsWith("/api/auth/callback/");
  if (writes && c.env.AUTH_LIMIT) {
    const key = c.req.header("cf-connecting-ip") ?? "unknown";
    const { success } = await c.env.AUTH_LIMIT.limit({ key });
    if (!success) return c.text("Too many requests. Try again in a minute.", 429);
  }
  await next();
});

app.use("*", async (c, next) => {
  const auth = authFor(c.env);
  if (!auth) return c.json({ error: "accounts_unavailable" }, 503);
  c.set("auth", auth);
  await next();
});

app.on(["GET", "POST"], "/api/auth/*", (c) => c.var.auth.handler(c.req.raw));

/**
 * Form posts must come from the site itself. Sec-Fetch-Site decides when the browser sends it: pages
 * can't forge it, and it's right even when a proxy rewrites Origin (wrangler dev does, to the
 * production host). Older browsers without it fall back to Origin, which must match the site.
 */
export function fromSite(headers: Headers, siteOrigin: string) {
  const site = headers.get("sec-fetch-site");
  if (site) return site === "same-origin";
  return headers.get("origin") === siteOrigin;
}

app.use("/api/account/*", async (c, next) => {
  if (c.req.method === "POST" && !fromSite(c.req.raw.headers, new URL(c.env.AUTH_URL).origin)) {
    // These two headers decide it, and hold nothing personal.
    console.warn("cross-site form post rejected", {
      path: c.req.path,
      origin: c.req.header("origin") ?? null,
      secFetchSite: c.req.header("sec-fetch-site") ?? null,
    });
    return c.text("Forbidden", 403);
  }
  await next();
});

/** A 303 to `location` carrying the cookies Better Auth set on `from`. */
function redirectWithCookies(from: Response, location: string) {
  const headers = new Headers({ Location: location, ...PRIVATE });
  for (const cookie of from.headers.getSetCookie()) headers.append("Set-Cookie", cookie);
  return new Response(null, { status: 303, headers });
}

app.get("/api/account/me", async (c) => {
  const session = await c.var.auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ user: null, providers: providers(c.env), dev: isLocal(c.env) }, 401);
  const accounts = await c.var.auth.api.listUserAccounts({ headers: c.req.raw.headers });
  return c.json({
    user: {
      handle: session.user.name,
      createdAt: session.user.createdAt,
      linked: accounts.map((a) => a.providerId),
      admin: isAdminAccount(c.env, accounts),
    },
    keys: await listKeys(c.env.AUTH_DB, session.user.id),
    providers: providers(c.env),
    dev: isLocal(c.env),
  });
});

app.post("/api/account/sign-in/:provider", async (c) => {
  const provider = c.req.param("provider");
  if (!providers(c.env).includes(provider as "google" | "github")) return c.text("Unknown provider", 404);
  const res = await c.var.auth.api.signInSocial({
    body: { provider, callbackURL: "/account", errorCallbackURL: "/login" },
    headers: c.req.raw.headers,
    asResponse: true,
  });
  const { url } = (await res.json()) as { url?: string };
  if (!res.ok || !url) return c.redirect("/login?error=sign_in_failed", 303);
  return redirectWithCookies(res, url);
});

app.post("/api/account/dev-sign-in", async (c) => {
  if (!isLocal(c.env)) return c.notFound();
  const headers = c.req.raw.headers;
  let res = await c.var.auth.api.signInEmail({
    body: { email: DEV_USER.email, password: DEV_USER.password },
    headers,
    asResponse: true,
  });
  if (!res.ok) res = await c.var.auth.api.signUpEmail({ body: DEV_USER, headers, asResponse: true });
  return redirectWithCookies(res, "/account");
});

app.post("/api/account/sign-out", async (c) => {
  const res = await c.var.auth.api.signOut({ headers: c.req.raw.headers, asResponse: true });
  return redirectWithCookies(res, "/");
});

/** Letters, digits, `-` and `_`; it's shown only to its owner for now. */
export const HANDLE = /^[A-Za-z0-9_-]{3,24}$/;

app.post("/api/account/handle", async (c) => {
  const name = String((await c.req.parseBody()).handle ?? "").trim();
  if (!HANDLE.test(name)) return c.redirect("/account?error=handle", 303);
  const res = await c.var.auth.api.updateUser({
    body: { name },
    headers: c.req.raw.headers,
    asResponse: true,
  });
  if (res.status === 401) return c.redirect("/login", 303);
  return redirectWithCookies(res, res.ok ? "/account?saved=1" : "/account?error=handle");
});

/**
 * Makes a key and answers 201 `{ key }`: ftcref-web shows it once on the account page. Errors
 * redirect back to the account page like the other forms.
 */
app.post("/api/account/keys", async (c) => {
  const session = await c.var.auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.redirect("/login", 303);
  const form = await c.req.parseBody();
  const result = await createKey(c.env.AUTH_DB, session.user.id, {
    name: String(form.name ?? ""),
    days: Number(form.expires ?? NaN),
  });
  if ("error" in result) return c.redirect(`/account?error=key_${result.error}`, 303);
  return c.json(result, 201);
});

app.post("/api/account/keys/:id/revoke", async (c) => {
  const session = await c.var.auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.redirect("/login", 303);
  await revokeKey(c.env.AUTH_DB, session.user.id, c.req.param("id"));
  return c.redirect("/account?revoked=1", 303);
});

app.post("/api/account/delete", async (c) => {
  if ((await c.req.parseBody()).confirm !== "delete") return c.redirect("/account?error=confirm", 303);
  const session = await c.var.auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.redirect("/login", 303);
  const res = await c.var.auth.api.deleteUser({ body: {}, headers: c.req.raw.headers, asResponse: true });
  if (res.status === 401) return c.redirect("/login", 303);
  // Deleting needs a recent sign-in (Better Auth's freshAge, 1 day).
  if (!res.ok) return c.redirect("/login?error=reauth", 303);
  // The foreign key cascades too; this doesn't rely on it. Keys of a deleted user never verify anyway.
  await deleteKeysOf(c.env.AUTH_DB, session.user.id);
  return redirectWithCookies(res, "/login?deleted=1");
});

/**
 * `Authorization: Bearer ftcr_…` → 200 `{ keyId, keyName, userId, handle }`, 401, or 429 when the key
 * is over KEY_LIMIT. A GET, so the per-IP AUTH_LIMIT on writes doesn't count API calls.
 */
app.get("/internal/verify-key", async (c) => {
  const key = /^Bearer (\S+)$/.exec(c.req.header("authorization") ?? "")?.[1] ?? "";
  const found = await verifyKey(c.env.AUTH_DB, key);
  if (!found) return c.json({ error: "invalid_key" }, 401);
  if (c.env.KEY_LIMIT && !(await c.env.KEY_LIMIT.limit({ key: found.keyId })).success)
    return c.json({ error: "rate_limited" }, 429);
  if (found.touch) c.executionCtx.waitUntil(touchKey(c.env.AUTH_DB, found.keyId));
  const { touch: _, ...owner } = found;
  return c.json(owner);
});

/**
 * The signed-in user behind a session cookie, for ftcref-web's /admin: 200 `{ handle, admin }` or
 * 401. Skips the 5-minute session cookie cache, so a sign-out or a removal from ADMIN_ACCOUNTS
 * takes effect on the next admin request.
 */
app.get("/internal/whoami", async (c) => {
  const headers = c.req.raw.headers;
  const session = await c.var.auth.api.getSession({ headers, query: { disableCookieCache: true } });
  if (!session) return c.json({ error: "signed_out" }, 401);
  const accounts = await c.var.auth.api.listUserAccounts({ headers });
  return c.json({ handle: session.user.name, admin: isAdminAccount(c.env, accounts) });
});

/**
 * Account counts for ftcref-web's /admin/traffic, for an admin's session cookie only (else 403/401).
 * "Active" = a session created or refreshed in the window (Better Auth refreshes once a day of use).
 */
app.get("/internal/stats", async (c) => {
  const headers = c.req.raw.headers;
  const session = await c.var.auth.api.getSession({ headers, query: { disableCookieCache: true } });
  if (!session) return c.json({ error: "signed_out" }, 401);
  if (!isAdminAccount(c.env, await c.var.auth.api.listUserAccounts({ headers })))
    return c.json({ error: "not_admin" }, 403);
  return c.json(await accountStats(c.env.AUTH_DB));
});

export async function accountStats(db: D1Database, now = new Date()) {
  const ago = (days: number) => new Date(now.getTime() - days * 86400_000).toISOString();
  const [d1, d7, d30] = [ago(1), ago(7), ago(30)];
  const row = await db
    .prepare(
      `SELECT (SELECT COUNT(*) FROM "user") AS users,
         (SELECT COUNT(*) FROM "user" WHERE "createdAt" >= ?2) AS new7,
         (SELECT COUNT(DISTINCT "userId") FROM "session" WHERE "updatedAt" >= ?1) AS active1,
         (SELECT COUNT(DISTINCT "userId") FROM "session" WHERE "updatedAt" >= ?2) AS active7,
         (SELECT COUNT(DISTINCT "userId") FROM "session" WHERE "updatedAt" >= ?3) AS active30,
         (SELECT COUNT(*) FROM "api_key") AS keys`,
    )
    .bind(d1, d7, d30)
    .first<Record<string, number>>();
  return row ?? {};
}

app.notFound((c) => c.json({ error: "not_found" }, 404));

/** Daily: drop expired sessions, sign-in state and API keys, so nothing lingers past its use. */
export async function purgeExpired(db: D1Database, now = new Date()) {
  const iso = now.toISOString();
  await db.batch([
    db.prepare(`DELETE FROM "session" WHERE "expiresAt" < ?`).bind(iso),
    db.prepare(`DELETE FROM "verification" WHERE "expiresAt" < ?`).bind(iso),
    db.prepare(`DELETE FROM "api_key" WHERE "expiresAt" < ?`).bind(iso),
  ]);
}

export { app };

export default {
  fetch: app.fetch,
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(purgeExpired(env.AUTH_DB));
  },
} satisfies ExportedHandler<Env>;
