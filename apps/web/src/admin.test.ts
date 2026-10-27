import { describe, expect, it } from "vitest";
import { adminUser, sameSitePost } from "./admin";
import type { AppContext, Env } from "./env";
import app from "./index";
import { adminRoutes } from "./routes/admin";

/** An ACCOUNT binding whose whoami answers `body` (or `status`), recording the requests it got. */
function account(answer: { handle: string; admin: boolean } | number) {
  const seen: Request[] = [];
  const ACCOUNT = {
    fetch: async (input: RequestInfo, init?: RequestInit) => {
      seen.push(new Request(input, init));
      return typeof answer === "number" ? new Response(null, { status: answer }) : Response.json(answer);
    },
  } as unknown as Fetcher;
  return { env: { ACCOUNT } as unknown as Env, seen };
}

const ctx = (env: Env, cookie?: string) =>
  ({ env, req: { header: (k: string) => (k === "cookie" ? cookie : undefined) } }) as unknown as AppContext;

// A signed cookie value as the browser sends it: URL-encoded, so it must be passed on as is.
const SESSION = "ftcref.session_token=abc.d%2Be%3D";

describe("adminUser", () => {
  it("asks the account Worker, passing only the raw session cookie", async () => {
    const { env, seen } = account({ handle: "Csherm", admin: true });
    expect(await adminUser(ctx(env, `stats=all; ${SESSION}; ftcref.session_data=xyz`))).toEqual({
      handle: "Csherm",
    });
    expect(new URL(seen[0]?.url ?? "").pathname).toBe("/internal/whoami");
    expect(seen[0]?.headers.get("cookie")).toBe(SESSION);
  });

  it("finds the __Secure- cookie that HTTPS sites get", async () => {
    const { env, seen } = account({ handle: "Csherm", admin: true });
    const secure = "__Secure-ftcref.session_token=abc.d%2Be%3D";
    expect(await adminUser(ctx(env, `stats=all; ftcref_admin=old; ${secure}`))).toEqual({ handle: "Csherm" });
    expect(seen[0]?.headers.get("cookie")).toBe(secure);
  });

  it("is null without a session cookie, without asking", async () => {
    const { env, seen } = account({ handle: "x", admin: true });
    expect(await adminUser(ctx(env, "stats=all"))).toBeNull();
    expect(await adminUser(ctx(env))).toBeNull();
    expect(seen).toHaveLength(0);
  });

  it("is null for non-admins, signed-out sessions and a missing or failing account Worker", async () => {
    expect(await adminUser(ctx(account({ handle: "x", admin: false }).env, SESSION))).toBeNull();
    expect(await adminUser(ctx(account(401).env, SESSION))).toBeNull();
    expect(await adminUser(ctx(account(500).env, SESSION))).toBeNull();
    expect(await adminUser(ctx({} as Env, SESSION))).toBeNull();
  });
});

describe("/admin", () => {
  it("is a 403 sign-in note for anyone but an admin, never cached", async () => {
    const res = await adminRoutes.request(
      "/admin",
      { headers: { cookie: SESSION } },
      account({ handle: "x", admin: false }).env,
    );
    expect(res.status).toBe(403);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.text()).toContain('href="/login"');
  });

  it("the old token login and logout are gone", async () => {
    const env = account(401).env;
    for (const path of ["/admin/login", "/admin/logout"]) {
      const res = await app.request(
        path,
        { method: "POST", headers: { "sec-fetch-site": "same-origin" } },
        env,
      );
      expect(res.status, path).toBe(404);
    }
  });

  it("refuses admin posts from another site before anything else runs", async () => {
    const { env, seen } = account({ handle: "x", admin: true });
    const res = await app.request(
      "/admin/resync",
      { method: "POST", headers: { cookie: SESSION, "sec-fetch-site": "cross-site" } },
      env,
    );
    expect(res.status).toBe(403);
    expect(seen).toHaveLength(0);
  });
});

describe("sameSitePost", () => {
  const ORIGIN = "https://ftc-reference.com";
  const h = (o: Record<string, string>) => sameSitePost(new Headers(o), ORIGIN);
  it("trusts Sec-Fetch-Site, else needs a matching Origin", () => {
    expect(h({ "sec-fetch-site": "same-origin", origin: "http://rewritten.example" })).toBe(true);
    expect(h({ "sec-fetch-site": "cross-site", origin: ORIGIN })).toBe(false);
    expect(h({ "sec-fetch-site": "same-site" })).toBe(false);
    expect(h({ origin: ORIGIN })).toBe(true);
    expect(h({ origin: "https://evil.example" })).toBe(false);
    expect(h({})).toBe(false);
  });
});
