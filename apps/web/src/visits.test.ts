import { describe, expect, it } from "vitest";
import type { Env } from "./env";
import app from "./index";
import { isHumanPageView } from "./visits";

const CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0 Safari/537.36";
const NAV = { "user-agent": CHROME, "sec-fetch-mode": "navigate", "sec-fetch-dest": "document" };
const html = new Response("<html></html>", { headers: { "Content-Type": "text/html; charset=utf-8" } });

describe("isHumanPageView", () => {
  const req = (h: Record<string, string>, method = "GET") =>
    new Request("https://ftc-reference.com/", { method, headers: h });
  it("counts a browser navigation to an HTML page", () => {
    expect(isHumanPageView(req(NAV), html)).toBe(true);
  });
  it("skips bots, prefetches, fetches, non-HTML and errors", () => {
    expect(isHumanPageView(req({ ...NAV, "user-agent": "Lightpanda/1.0" }), html)).toBe(false);
    expect(
      isHumanPageView(req({ ...NAV, "user-agent": `${CHROME} (compatible; meta-webindexer/1.1)` }), html),
    ).toBe(false);
    expect(isHumanPageView(req({ ...NAV, "sec-purpose": "prefetch" }), html)).toBe(false);
    expect(isHumanPageView(req({ ...NAV, "sec-fetch-mode": "cors" }), html)).toBe(false);
    expect(isHumanPageView(req({ "user-agent": CHROME }), html)).toBe(false);
    expect(isHumanPageView(req(NAV, "POST"), html)).toBe(false);
    expect(
      isHumanPageView(req(NAV), new Response("{}", { headers: { "Content-Type": "application/json" } })),
    ).toBe(false);
    expect(isHumanPageView(req(NAV), new Response("", { status: 404, headers: html.headers }))).toBe(false);
  });
});

describe("page-view recording", () => {
  function env() {
    const points: AnalyticsEngineDataPoint[] = [];
    const kv = new Map<string, string>();
    const e = {
      DEV: "1", // skip the edge HTML cache (no caches.default here)
      PAGEVIEWS: { writeDataPoint: (p: AnalyticsEngineDataPoint) => points.push(p) },
      CACHE_VER: {
        get: async (k: string) => kv.get(k) ?? null,
        put: async (k: string, v: string) => void kv.set(k, v),
      },
    } as unknown as Env;
    const waits: Promise<unknown>[] = [];
    const ctx = {
      waitUntil: (p: Promise<unknown>) => waits.push(p),
      passThroughOnException() {},
    } as ExecutionContext;
    return { e, ctx, points, kv, done: () => Promise.all(waits) };
  }
  const visit = (t: ReturnType<typeof env>, path: string, h: Record<string, string>) =>
    app.request(path, { headers: { ...NAV, ...h } }, t.e, t.ctx);

  it("writes a hashed visitor id, never the IP; same visitor, same id", async () => {
    const t = env();
    await visit(t, "/privacy", {
      "cf-connecting-ip": "203.0.113.9",
      referer: "https://www.google.com/search",
    });
    await visit(t, "/privacy", { "cf-connecting-ip": "203.0.113.9", cookie: "ftcref.session_token=x" });
    await visit(t, "/privacy", { "cf-connecting-ip": "198.51.100.1" });
    await t.done();
    expect(t.points).toHaveLength(3);
    const [a, b, c] = t.points;
    expect(a?.indexes?.[0]).toMatch(/^[0-9a-f]{16}$/);
    expect(b?.indexes).toEqual(a?.indexes);
    expect(c?.indexes).not.toEqual(a?.indexes);
    expect(a?.blobs).toEqual(["/privacy", "", "desktop", "www.google.com", "0"]);
    expect(b?.blobs?.[4]).toBe("1");
    expect(JSON.stringify(t.points)).not.toContain("203.0.113.9");
    expect([...t.kv.keys()]).toEqual([expect.stringMatching(/^visitor-salt:\d{4}-\d{2}-\d{2}$/)]);
  });

  it("leaves out bots and /admin", async () => {
    const t = env();
    await visit(t, "/privacy", { "user-agent": "SemrushBot/7" });
    await visit(t, "/admin", {});
    await t.done();
    expect(t.points).toHaveLength(0);
  });
});
