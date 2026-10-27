import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { getMigrations } from "better-auth/db/migration";
import { afterEach, describe, expect, it, vi } from "vitest";
import { authOptions } from "./auth";
import type { Env } from "./env";
import { app, fromSite, purgeExpired } from "./index";

const ORIGIN = "http://localhost:8788";
const MIGRATION = readFileSync(join(__dirname, "../../../packages/db/auth-migrations/0001_auth.sql"), "utf8");

/** A fresh accounts DB (node:sqlite, which Better Auth accepts like D1) with the committed migration. */
function makeEnv(over: Partial<Env> = {}) {
  const db = new DatabaseSync(":memory:");
  db.exec(MIGRATION);
  const env = {
    AUTH_DB: db as unknown as D1Database,
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
  return app.request(`${ORIGIN}${path}`, { ...init, headers, body }, env).then((r) => jar.take(r));
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
    const { db, env } = makeEnv();
    const options = authOptions(env, db);
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

  it("decides same-site posts by Origin, else Sec-Fetch-Site", () => {
    const h = (o: Record<string, string>) => fromSite(new Headers(o), ORIGIN);
    expect(h({ origin: ORIGIN })).toBe(true);
    expect(h({ origin: "https://evil.example", "sec-fetch-site": "same-origin" })).toBe(false);
    expect(h({ origin: "null", "sec-fetch-site": "same-origin" })).toBe(true);
    expect(h({ origin: "null", "sec-fetch-site": "cross-site" })).toBe(false);
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
    // Just enough of D1 for purgeExpired.
    const d1 = {
      prepare: (sql: string) => ({ bind: (...args: string[]) => ({ sql, args }) }),
      batch: async (stmts: { sql: string; args: string[] }[]) =>
        stmts.map((s) => db.prepare(s.sql).run(...s.args)),
    } as unknown as D1Database;
    await purgeExpired(d1, new Date("2026-10-26T00:00:00Z"));
    expect(rows(db, "session").map((s) => s.id)).toEqual(["new"]);
    expect(rows(db, "verification")).toHaveLength(0);
  });
});
