import { describe, expect, it } from "vitest";
import type { Env } from "../env";
import { apiRoutes } from "./api";

const OWNER = { keyId: "k1", keyName: "scouting app", userId: "u1", handle: "team_4201" };

/** An ACCOUNT binding that answers verify-key with `status`, recording what it was sent. */
function account(status: number) {
  const seen: Request[] = [];
  const ACCOUNT = {
    fetch: async (input: RequestInfo, init?: RequestInit) => {
      seen.push(new Request(input, init));
      return status === 200 ? Response.json(OWNER) : Response.json({}, { status });
    },
  } as unknown as Fetcher;
  return { env: { ACCOUNT } as unknown as Env, seen };
}

const get = (env: Env, path: string, authorization?: string) =>
  apiRoutes.request(path, { headers: authorization ? { authorization } : {} }, env);

describe("/api/v1", () => {
  it("asks for a key without calling the account Worker", async () => {
    const { env, seen } = account(200);
    const res = await get(env, "/api/v1/me");
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toMatch(/^Bearer /);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(seen).toHaveLength(0);
  });

  it("me returns the key's owner, privately", async () => {
    const { env, seen } = account(200);
    const res = await get(env, "/api/v1/me", "Bearer ftcr_abc");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ handle: "team_4201", key: "scouting app" });
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(new URL(seen[0]?.url ?? "").pathname).toBe("/internal/verify-key");
    expect(seen[0]?.headers.get("authorization")).toBe("Bearer ftcr_abc");
    // Only the key goes to the account Worker: no cookies or other headers.
    expect([...(seen[0]?.headers.keys() ?? [])]).toEqual(["authorization"]);
  });

  it("passes on invalid keys and rate limits", async () => {
    const bad = await get(account(401).env, "/api/v1/me", "Bearer ftcr_x");
    expect(bad.status).toBe(401);
    expect(((await bad.json()) as { error: string }).error).toBe("invalid_key");
    const limited = await get(account(429).env, "/api/v1/me", "Bearer ftcr_x");
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("60");
  });

  it("is unavailable, not open, when the account Worker is missing or failing", async () => {
    expect((await get({} as Env, "/api/v1/me", "Bearer ftcr_x")).status).toBe(503);
    expect((await get(account(500).env, "/api/v1/me", "Bearer ftcr_x")).status).toBe(503);
  });

  it("unknown endpoints are JSON 404s, after the key check", async () => {
    expect((await get(account(200).env, "/api/v1/nope")).status).toBe(401);
    const res = await get(account(200).env, "/api/v1/nope", "Bearer ftcr_x");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
  });
});
