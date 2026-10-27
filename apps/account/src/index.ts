import { Hono } from "hono";
import { type Auth, authFor, DEV_USER, isLocal, providers } from "./auth";
import type { Env } from "./env";

/**
 * ftcref-account: sign-in, sessions and account data. It has no public URL; ftcref-web forwards
 * `/api/auth/*` and `/api/account/*` here over its ACCOUNT service binding and renders the HTML
 * pages itself. Keeping Better Auth out of ftcref-web keeps the public Worker small, and means it
 * can't put a signed-in page in the shared edge cache.
 *
 * `/api/auth/*` is Better Auth (OAuth redirects and callbacks). `/api/account/*` is ours: plain form
 * posts from the web pages, answered with 303 redirects, plus `me` for the account page.
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
 * Form posts must come from the site itself. Browsers send Origin on a POST, but some privacy
 * settings send `Origin: null`; then Sec-Fetch-Site (which pages can't forge) decides.
 */
export function fromSite(headers: Headers, siteOrigin: string) {
  const origin = headers.get("origin");
  if (origin && origin !== "null") return origin === siteOrigin;
  return headers.get("sec-fetch-site") === "same-origin";
}

app.use("/api/account/*", async (c, next) => {
  if (c.req.method === "POST" && !fromSite(c.req.raw.headers, new URL(c.env.AUTH_URL).origin))
    return c.text("Forbidden", 403);
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
    },
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

app.post("/api/account/delete", async (c) => {
  if ((await c.req.parseBody()).confirm !== "delete") return c.redirect("/account?error=confirm", 303);
  const res = await c.var.auth.api.deleteUser({ body: {}, headers: c.req.raw.headers, asResponse: true });
  if (res.status === 401) return c.redirect("/login", 303);
  // Deleting needs a recent sign-in (Better Auth's freshAge, 1 day).
  if (!res.ok) return c.redirect("/login?error=reauth", 303);
  return redirectWithCookies(res, "/login?deleted=1");
});

app.notFound((c) => c.json({ error: "not_found" }, 404));

/** Daily: drop expired sessions and sign-in state, so nothing lingers past its use. */
export async function purgeExpired(db: D1Database, now = new Date()) {
  const iso = now.toISOString();
  await db.batch([
    db.prepare(`DELETE FROM "session" WHERE "expiresAt" < ?`).bind(iso),
    db.prepare(`DELETE FROM "verification" WHERE "expiresAt" < ?`).bind(iso),
  ]);
}

export { app };

export default {
  fetch: app.fetch,
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(purgeExpired(env.AUTH_DB));
  },
} satisfies ExportedHandler<Env>;
