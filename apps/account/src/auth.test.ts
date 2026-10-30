import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { getMigrations } from "better-auth/db/migration";
import { afterEach, describe, expect, it, vi } from "vitest";
import { authOptions, isAdminAccount } from "./auth";
import type { Env } from "./env";
import { app, fromSite, purgeExpired } from "./index";
import { touchKey, verifyKey } from "./keys";

const ORIGIN = "http://localhost:8788";
const MIGRATIONS_DIR = join(__dirname, "../../../packages/db/auth-migrations");
const MIGRATIONS = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(join(MIGRATIONS_DIR, f), "utf8"));

type Bindable = string | number | bigint | null | Uint8Array;
const bindable = (v: unknown): Bindable =>
  v instanceof Date ? v.toISOString() : typeof v === "boolean" ? Number(v) : (v as Bindable);

/** Enough of D1 over node:sqlite for Better Auth (which then uses its D1 dialect) and our own SQL. */
function d1(db: DatabaseSync): D1Database {
  const stmt = (sql: string, args: unknown[] = []) => {
    const run = () => {
      const s = db.prepare(sql);
      const params = args.map(bindable);
      if (s.columns().length) return { results: s.all(...params), meta: { changes: 0, last_row_id: 0 } };
      const r = s.run(...params);
      return { results: [], meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
    };
    return {
      bind: (...a: unknown[]) => stmt(sql, a),
      first: async (col?: string) => {
        const row = (run().results[0] as Record<string, unknown> | undefined) ?? null;
        return row && col ? row[col] : row;
      },
      all: async () => ({ success: true, ...run() }),
      run: async () => ({ success: true, ...run() }),
      raw: async () => run().results.map((r) => Object.values(r as object)),
    };
  };
  return {
    prepare: (sql: string) => stmt(sql),
    batch: async (stmts: ReturnType<typeof stmt>[]) => Promise.all(stmts.map((s) => s.all())),
    exec: async (sql: string) => {
      db.exec(sql);
      return { count: 0, duration: 0 };
    },
  } as unknown as D1Database;
}

/** Runs waitUntil work so tests can await it. */
function ctx() {
  const pending: Promise<unknown>[] = [];
  return {
    waitUntil: (p: Promise<unknown>) => void pending.push(p),
    passThroughOnException: () => {},
    props: {},
    settled: () => Promise.all(pending),
  };
}

/** A fresh accounts DB with every committed migration. */
function makeEnv(over: Partial<Env> = {}) {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  for (const m of MIGRATIONS) db.exec(m);
  const env = {
    AUTH_DB: d1(db),
    AUTH_URL: ORIGIN,
    ENV_NAME: "production",
    BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret-0123",
    GITHUB_CLIENT_ID: "gh-id",
    GITHUB_CLIENT_SECRET: "gh-secret",
    GOOGLE_CLIENT_ID: "g-id",
    GOOGLE_CLIENT_SECRET: "g-secret",
    ...over,
  } satisfies Env;
  return { db, env };
}

const rows = (db: DatabaseSync, table: string) =>
  db.prepare(`SELECT * FROM "${table}"`).all() as Record<string, unknown>[];

/** Accumulates cookies across responses, like a browser. */
class Jar {
  private c = new Map<string, string>();
  take(res: Response) {
    for (const line of res.headers.getSetCookie()) {
      const [pair = ""] = line.split(";");
      const i = pair.indexOf("=");
      const [k, v] = [pair.slice(0, i), pair.slice(i + 1)];
      if (/max-age=0/i.test(line) || v === "") this.c.delete(k);
      else this.c.set(k, v);
    }
    return res;
  }
  get header() {
    return [...this.c].map(([k, v]) => `${k}=${v}`).join("; ");
  }
}

function req(env: Env, jar: Jar, path: string, init: RequestInit & { form?: Record<string, string> } = {}) {
  const headers = new Headers(init.headers);
  if (jar.header) headers.set("cookie", jar.header);
  headers.set("user-agent", "TestBrowser/1.0");
  headers.set("x-forwarded-for", "203.0.113.9");
  let body = init.body;
  if (init.form) {
    body = new URLSearchParams(init.form).toString();
    headers.set("content-type", "application/x-www-form-urlencoded");
  }
  if (init.method === "POST" && !headers.has("origin")) headers.set("origin", ORIGIN);
  return app
    .request(`${ORIGIN}${path}`, { ...init, headers, body }, env, ctx() as unknown as ExecutionContext)
    .then((r) => jar.take(r));
}

const b64url = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const googleIdToken = `${b64url({ alg: "none" })}.${b64url({
  iss: "https://accounts.google.com",
  aud: "g-id",
  sub: "1098765432101234",
  email: "real.kid@gmail.com",
  name: "Real Kid",
  picture: "https://x/p.png",
  exp: 9e9,
  iat: 1,
})}.x`;

/** Stands in for GitHub and Google. Returns the URLs fetched. */
function stubProviders() {
  const calls: string[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    const u = String(input instanceof Request ? input.url : input);
    calls.push(u);
    const json = (b: unknown) => Response.json(b);
    if (u.startsWith("https://github.com/login/oauth/access_token"))
      return json({ access_token: "gho_SECRET", token_type: "bearer", scope: "read:user" });
    if (u === "https://api.github.com/user")
      return json({
        id: 4201,
        login: "octo-kid",
        name: "Real Name",
        email: "public@x.com",
        avatar_url: "https://x/a.png",
      });
    if (u === "https://api.github.com/user/emails") return new Response("not found", { status: 404 });
    if (u.startsWith("https://oauth2.googleapis.com/token"))
      return json({
        access_token: "ya29.SECRET",
        id_token: googleIdToken,
        refresh_token: "1//SECRET",
        expires_in: 3600,
      });
    throw new Error(`unexpected fetch ${u}`);
  });
  return calls;
}

async function signIn(env: Env, jar: Jar, provider: "github" | "google") {
  const start = await req(env, jar, `/api/account/sign-in/${provider}`, { method: "POST" });
  expect(start.status).toBe(303);
  const authorize = new URL(start.headers.get("location") ?? "");
  const state = authorize.searchParams.get("state");
  const done = await req(env, jar, `/api/auth/callback/${provider}?code=abc&state=${state}`);
  return { authorize, done };
}

afterEach(() => vi.unstubAllGlobals());

describe("auth schema", () => {
  it("the committed migration is exactly what Better Auth expects", async () => {
    const { env } = makeEnv();
    const options = authOptions(env, env.AUTH_DB);
    if (!options) throw new Error("no options");
    const { toBeCreated, toBeAdded } = await getMigrations(options);
    expect(toBeCreated).toEqual([]);
    expect(toBeAdded).toEqual([]);
  });
});

describe("sign-in stores only what it needs", () => {
  for (const provider of ["github", "google"] as const) {
    it(`${provider}: minimal scope; no email, name, avatar, tokens, IP or user agent`, async () => {
      const { db, env } = makeEnv();
      stubProviders();
      const jar = new Jar();
      const { authorize, done } = await signIn(env, jar, provider);
      expect(authorize.searchParams.get("scope")).toBe(provider === "github" ? "read:user" : "openid");
      expect(done.status).toBe(302);
      expect(done.headers.get("location")).toBe("/account");

      const [user] = rows(db, "user");
      expect(user?.email).toMatch(/^(github-4201|google-1098765432101234)@users\.invalid$/);
      expect(user?.name).toBe(provider === "github" ? "octo-kid" : "user-101234");
      expect(user?.image).toBeNull();
      const stored = JSON.stringify([rows(db, "user"), rows(db, "account"), rows(db, "session")]);
      for (const leak of [
        "SECRET",
        "Real",
        "real.kid",
        "public@x.com",
        "a.png",
        "p.png",
        "203.0.113.9",
        "TestBrowser",
      ])
        expect(stored).not.toContain(leak);
      const [account] = rows(db, "account");
      expect(account).toMatchObject({
        providerId: provider,
        accessToken: null,
        refreshToken: null,
        idToken: null,
      });
      expect(rows(db, "session")[0]).toMatchObject({ ipAddress: null, userAgent: null });

      const me = await req(env, jar, "/api/account/me");
      expect(me.status).toBe(200);
      expect(await me.json()).toMatchObject({ user: { handle: user?.name, linked: [provider] } });
    });
  }
});

describe("account routes", () => {
  it("every response is private", async () => {
    const { env } = makeEnv();
    for (const path of ["/api/account/me", "/api/auth/ok", "/nope"]) {
      const res = await req(env, new Jar(), path);
      expect(res.headers.get("cache-control"), path).toBe("private, no-store");
    }
  });

  it("me is 401 when signed out and lists the configured providers", async () => {
    const { env } = makeEnv({ GOOGLE_CLIENT_ID: undefined });
    const res = await req(env, new Jar(), "/api/account/me");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ user: null, providers: ["github"], dev: false });
  });

  it("rejects form posts from another origin", async () => {
    const { env } = makeEnv();
    const res = await req(env, new Jar(), "/api/account/sign-in/github", {
      method: "POST",
      headers: { origin: "https://evil.example" },
    });
    expect(res.status).toBe(403);
  });

  it("decides same-site posts by Sec-Fetch-Site, else Origin", () => {
    const h = (o: Record<string, string>) => fromSite(new Headers(o), ORIGIN);
    expect(h({ origin: ORIGIN, "sec-fetch-site": "same-origin" })).toBe(true);
    // A proxy rewrote Origin (wrangler dev): the browser's own Sec-Fetch-Site still says same-origin.
    expect(h({ origin: "http://ftc-reference.com", "sec-fetch-site": "same-origin" })).toBe(true);
    expect(h({ origin: "null", "sec-fetch-site": "same-origin" })).toBe(true);
    expect(h({ origin: ORIGIN, "sec-fetch-site": "cross-site" })).toBe(false);
    expect(h({ origin: ORIGIN, "sec-fetch-site": "same-site" })).toBe(false);
    expect(h({ origin: ORIGIN, "sec-fetch-site": "none" })).toBe(false);
    // Browsers without Fetch Metadata: Origin must match.
    expect(h({ origin: ORIGIN })).toBe(true);
    expect(h({ origin: "https://evil.example" })).toBe(false);
    expect(h({ origin: "null" })).toBe(false);
    expect(h({})).toBe(false);
  });

  it("is unavailable (503) without a secret outside local dev", async () => {
    const { env } = makeEnv({ BETTER_AUTH_SECRET: undefined });
    expect((await req(env, new Jar(), "/api/account/me")).status).toBe(503);
  });

  it("dev sign-in exists only locally", async () => {
    const prod = makeEnv();
    expect((await req(prod.env, new Jar(), "/api/account/dev-sign-in", { method: "POST" })).status).toBe(404);
    expect(
      (
        await req(prod.env, new Jar(), "/api/auth/sign-up/email", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email: "a@b.c", password: "longpassword", name: "x" }),
        })
      ).status,
    ).not.toBe(200);

    const local = makeEnv({
      ENV_NAME: "local",
      BETTER_AUTH_SECRET: undefined,
      GITHUB_CLIENT_ID: undefined,
      GOOGLE_CLIENT_ID: undefined,
    });
    const jar = new Jar();
    for (let i = 0; i < 2; i++) {
      const res = await req(local.env, jar, "/api/account/dev-sign-in", { method: "POST" });
      expect(res.status).toBe(303);
      expect(res.headers.get("location")).toBe("/account");
    }
    expect(rows(local.db, "user")).toHaveLength(1);
    expect(await (await req(local.env, jar, "/api/account/me")).json()).toMatchObject({
      user: { handle: "dev" },
      dev: true,
    });
  });

  it("renames the handle, rejecting bad ones", async () => {
    const { db, env } = makeEnv();
    stubProviders();
    const jar = new Jar();
    await signIn(env, jar, "github");
    const bad = await req(env, jar, "/api/account/handle", { method: "POST", form: { handle: "<b>" } });
    expect(bad.headers.get("location")).toBe("/account?error=handle");
    const ok = await req(env, jar, "/api/account/handle", { method: "POST", form: { handle: "team_4201" } });
    expect(ok.headers.get("location")).toBe("/account?saved=1");
    expect(rows(db, "user")[0]?.name).toBe("team_4201");
  });

  it("sign out ends the session", async () => {
    const { db, env } = makeEnv();
    stubProviders();
    const jar = new Jar();
    await signIn(env, jar, "github");
    const out = await req(env, jar, "/api/account/sign-out", { method: "POST" });
    expect(out.headers.get("location")).toBe("/");
    expect(rows(db, "session")).toHaveLength(0);
    expect((await req(env, jar, "/api/account/me")).status).toBe(401);
  });

  it("delete needs the confirm word, then removes every row", async () => {
    const { db, env } = makeEnv();
    stubProviders();
    const jar = new Jar();
    await signIn(env, jar, "google");
    const unconfirmed = await req(env, jar, "/api/account/delete", { method: "POST", form: {} });
    expect(unconfirmed.headers.get("location")).toBe("/account?error=confirm");
    const del = await req(env, jar, "/api/account/delete", { method: "POST", form: { confirm: "delete" } });
    expect(del.headers.get("location")).toBe("/login?deleted=1");
    for (const t of ["user", "account", "session"]) expect(rows(db, t), t).toHaveLength(0);
  });
});

describe("purgeExpired", () => {
  it("deletes only expired sessions and sign-in state", async () => {
    const { db } = makeEnv();
    db.exec(`INSERT INTO "user" VALUES ('u','h','u@users.invalid',0,NULL,'2026-01-01','2026-01-01')`);
    db.exec(`INSERT INTO "session" VALUES ('old','2026-10-01T00:00:00.000Z','t1','x','x',NULL,NULL,'u'),
                                         ('new','2026-12-01T00:00:00.000Z','t2','x','x',NULL,NULL,'u')`);
    db.exec(`INSERT INTO "verification" VALUES ('v','i','x','2026-10-01T00:00:00.000Z','x','x')`);
    db.exec(`INSERT INTO "api_key" VALUES ('k1','u','old','ftcr_a','h1','x',NULL,'2026-10-01T00:00:00.000Z'),
                                         ('k2','u','new','ftcr_b','h2','x',NULL,'2026-12-01T00:00:00.000Z'),
                                         ('k3','u','forever','ftcr_c','h3','x',NULL,NULL)`);
    await purgeExpired(d1(db), new Date("2026-10-26T00:00:00Z"));
    expect(rows(db, "session").map((s) => s.id)).toEqual(["new"]);
    expect(rows(db, "verification")).toHaveLength(0);
    expect(rows(db, "api_key").map((k) => k.id)).toEqual(["k2", "k3"]);
  });
});

describe("API keys", () => {
  const verify = (env: Env, key: string) =>
    app.request(
      "https://account/internal/verify-key",
      { headers: { authorization: `Bearer ${key}` } },
      env,
      ctx() as unknown as ExecutionContext,
    );

  async function withUser(provider: "github" | "google" = "github", over: Partial<Env> = {}) {
    const { db, env } = makeEnv(over);
    stubProviders();
    const jar = new Jar();
    await signIn(env, jar, provider);
    const create = async (form: Record<string, string>) =>
      req(env, jar, "/api/account/keys", { method: "POST", form });
    return { db, env, jar, create };
  }

  it("creates a key shown once; stores only its hash and first characters", async () => {
    const { db, env, jar, create } = await withUser();
    const res = await create({ name: "scouting app", expires: "365" });
    expect(res.status).toBe(201);
    const { key } = (await res.json()) as { key: string };
    expect(key).toMatch(/^ftcr_[A-Za-z0-9_-]{43}$/);
    const [row] = rows(db, "api_key");
    expect(row).toMatchObject({ name: "scouting app", start: key.slice(0, 11), lastUsedAt: null });
    expect(row?.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(rows(db, "api_key"))).not.toContain(key);
    expect(Date.parse(String(row?.expiresAt)) - Date.parse(String(row?.createdAt))).toBe(365 * 86_400_000);

    const me = (await (await req(env, jar, "/api/account/me")).json()) as { keys: Record<string, unknown>[] };
    expect(me.keys).toHaveLength(1);
    expect(Object.keys(me.keys[0] ?? {}).sort()).toEqual(
      ["createdAt", "expiresAt", "id", "lastUsedAt", "name", "start"].sort(),
    );
  });

  it("rejects bad names and expiries, and caps keys per user", async () => {
    const { db, create } = await withUser();
    const loc = async (form: Record<string, string>) => (await create(form)).headers.get("location");
    expect(await loc({ name: "  ", expires: "30" })).toBe("/account?error=key_name");
    expect(await loc({ name: "x".repeat(41), expires: "30" })).toBe("/account?error=key_name");
    expect(await loc({ name: "ok", expires: "7" })).toBe("/account?error=key_expiry");
    for (let i = 0; i < 5; i++) expect((await create({ name: `k${i}`, expires: "0" })).status).toBe(201);
    expect(await loc({ name: "sixth", expires: "0" })).toBe("/account?error=key_limit");
    expect(rows(db, "api_key")).toHaveLength(5);
    expect(rows(db, "api_key")[0]?.expiresAt).toBeNull();
  });

  it("key creation needs a session and a same-site post", async () => {
    const { env } = makeEnv();
    const anon = await req(env, new Jar(), "/api/account/keys", {
      method: "POST",
      form: { name: "x", expires: "0" },
    });
    expect(anon.headers.get("location")).toBe("/login");
    const { jar } = await withUser();
    const cross = await req(env, jar, "/api/account/keys", {
      method: "POST",
      form: { name: "x", expires: "0" },
      headers: { origin: "https://evil.example" },
    });
    expect(cross.status).toBe(403);
  });

  it("verifies a key: owner on success, 401 for malformed, unknown or expired keys", async () => {
    const { db, env, create } = await withUser();
    const { key } = (await (await create({ name: "bot", expires: "30" })).json()) as { key: string };
    const ok = await verify(env, key);
    expect(ok.status).toBe(200);
    const owner = (await ok.json()) as Record<string, unknown>;
    expect(owner).toMatchObject({ keyName: "bot", handle: "octo-kid" });
    expect(Object.keys(owner).sort()).toEqual(["handle", "keyId", "keyName", "userId"]);

    expect((await verify(env, "nope")).status).toBe(401);
    expect((await verify(env, `${key.slice(0, -1)}${key.endsWith("A") ? "B" : "A"}`)).status).toBe(401);
    db.exec(`UPDATE "api_key" SET "expiresAt" = '2020-01-01T00:00:00.000Z'`);
    expect((await verify(env, key)).status).toBe(401);
  });

  it("writes last-used at most once an hour", async () => {
    const { db, env, create } = await withUser();
    const { key } = (await (await create({ name: "bot", expires: "0" })).json()) as { key: string };
    const t0 = new Date("2026-10-27T10:00:00Z");
    const first = await verifyKey(env.AUTH_DB, key, t0);
    expect(first?.touch).toBe(true);
    await touchKey(env.AUTH_DB, first?.keyId ?? "", t0);
    expect((await verifyKey(env.AUTH_DB, key, new Date("2026-10-27T10:59:00Z")))?.touch).toBe(false);
    expect((await verifyKey(env.AUTH_DB, key, new Date("2026-10-27T11:01:00Z")))?.touch).toBe(true);
    expect(rows(db, "api_key")[0]?.lastUsedAt).toBe(t0.toISOString());
  });

  it("applies the per-key rate limit", async () => {
    const limited: string[] = [];
    const KEY_LIMIT = {
      limit: async ({ key }: { key: string }) => {
        limited.push(key);
        return { success: false };
      },
    } as RateLimit;
    const { db, env, create } = await withUser("github", { KEY_LIMIT });
    const { key } = (await (await create({ name: "bot", expires: "0" })).json()) as { key: string };
    expect((await verify(env, key)).status).toBe(429);
    // Limited per key, not per IP: a school's shared address doesn't pool everyone's keys.
    expect(limited).toEqual([rows(db, "api_key")[0]?.id]);
  });

  it("revoking only works on your own keys", async () => {
    const a = await withUser("github");
    const { key } = (await (await a.create({ name: "a", expires: "0" })).json()) as { key: string };
    const keyId = String(rows(a.db, "api_key")[0]?.id);
    // Another user, same DB.
    const bJar = new Jar();
    await signIn(a.env, bJar, "google");
    await req(a.env, bJar, `/api/account/keys/${keyId}/revoke`, { method: "POST" });
    expect((await verify(a.env, key)).status).toBe(200);
    const revoke = await req(a.env, a.jar, `/api/account/keys/${keyId}/revoke`, { method: "POST" });
    expect(revoke.headers.get("location")).toBe("/account?revoked=1");
    expect((await verify(a.env, key)).status).toBe(401);
    expect(rows(a.db, "api_key")).toHaveLength(0);
  });

  it("deleting the account deletes its keys", async () => {
    const { db, env, jar, create } = await withUser("google");
    const { key } = (await (await create({ name: "a", expires: "0" })).json()) as { key: string };
    const del = await req(env, jar, "/api/account/delete", { method: "POST", form: { confirm: "delete" } });
    expect(del.headers.get("location")).toBe("/login?deleted=1");
    expect(rows(db, "api_key")).toHaveLength(0);
    expect((await verify(env, key)).status).toBe(401);
  });
});

describe("admin role", () => {
  const whoami = (env: Env, jar: Jar) => req(env, jar, "/internal/whoami");

  it("comes from ADMIN_ACCOUNTS, by provider and the provider's own id", () => {
    const env = makeEnv({ ADMIN_ACCOUNTS: " github:4201 , google:99" }).env;
    const is = (providerId: string, accountId: string) => isAdminAccount(env, [{ providerId, accountId }]);
    expect(is("github", "4201")).toBe(true);
    expect(is("google", "99")).toBe(true);
    expect(is("google", "4201")).toBe(false);
    expect(is("github", "42")).toBe(false);
    expect(isAdminAccount(makeEnv().env, [{ providerId: "github", accountId: "4201" }])).toBe(false);
    // Dev sign-in is an admin locally, and only locally.
    const dev = [{ providerId: "credential", accountId: "u" }];
    expect(isAdminAccount(makeEnv({ ENV_NAME: "local" }).env, dev)).toBe(true);
    expect(isAdminAccount(env, dev)).toBe(false);
  });

  it("whoami: 401 signed out; admin only for listed accounts; me says so too", async () => {
    const { env } = makeEnv({ ADMIN_ACCOUNTS: "github:4201" });
    expect((await whoami(env, new Jar())).status).toBe(401);
    stubProviders();
    const gh = new Jar();
    await signIn(env, gh, "github");
    expect(await (await whoami(env, gh)).json()).toEqual({ handle: "octo-kid", admin: true });
    expect(await (await req(env, gh, "/api/account/me")).json()).toMatchObject({ user: { admin: true } });
    const google = new Jar();
    await signIn(env, google, "google");
    expect(await (await whoami(env, google)).json()).toEqual({ handle: "user-101234", admin: false });
  });

  it("stats: account counts for admins only", async () => {
    const { env } = makeEnv({ ADMIN_ACCOUNTS: "github:4201" });
    expect((await req(env, new Jar(), "/internal/stats")).status).toBe(401);
    stubProviders();
    const google = new Jar();
    await signIn(env, google, "google");
    expect((await req(env, google, "/internal/stats")).status).toBe(403);
    const gh = new Jar();
    await signIn(env, gh, "github");
    const stats = await (await req(env, gh, "/internal/stats")).json();
    expect(stats).toEqual({ users: 2, new7: 2, active1: 2, active7: 2, active30: 2, keys: 0 });
  });

  it("whoami sees a revoked session at once, despite the session cookie cache", async () => {
    const { db, env } = makeEnv({ ADMIN_ACCOUNTS: "github:4201" });
    stubProviders();
    const jar = new Jar();
    await signIn(env, jar, "github");
    expect(jar.header).toContain("ftcref.session_data=");
    db.exec(`DELETE FROM "session"`);
    expect((await whoami(env, jar)).status).toBe(401);
  });
});
