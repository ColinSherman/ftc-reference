import { describe, expect, it } from "vitest";
import { FtcApi, FtcApiError, parseJsonBody } from "./client";

const mk = (responses: Response[]) => {
  const calls: RequestInit[] = [];
  const fetch = (async (_url: string, init: RequestInit) => {
    calls.push(init);
    const r = responses.shift();
    if (!r) throw new Error("no more responses");
    return r;
  }) as unknown as typeof globalThis.fetch;
  return { api: new FtcApi({ user: "u", token: "t", fetch, baseDelayMs: 1 }), calls };
};

describe("FtcApi", () => {
  it("sends basic auth and If-Modified-Since, returns not_modified on 304", async () => {
    const { api, calls } = mk([new Response(null, { status: 304 })]);
    const r = await api.get(2026, "events", "Mon, 12 Oct 2026 00:00:00 GMT");
    expect(r.status).toBe("not_modified");
    const h = calls[0]?.headers as Record<string, string>;
    expect(h.Authorization).toBe(`Basic ${btoa("u:t")}`);
    expect(h["If-Modified-Since"]).toBe("Mon, 12 Oct 2026 00:00:00 GMT");
    expect(api.notModified).toBe(1);
  });

  it("returns data and Last-Modified", async () => {
    const { api } = mk([
      new Response('{"events":[]}', {
        headers: { "Last-Modified": "X", "Content-Type": "application/json" },
      }),
    ]);
    const r = await api.get<{ events: unknown[] }>(2026, "events");
    expect(r).toMatchObject({ status: "ok", lastModified: "X", data: { events: [] } });
  });

  it("retries 429 then succeeds", async () => {
    const { api } = mk([new Response("slow down", { status: 429 }), new Response("{}")]);
    const r = await api.get(2026, "events");
    expect(r.status).toBe("ok");
    expect(api.requests).toBe(2);
  });

  it("throws on 4xx without retrying", async () => {
    const { api } = mk([new Response("nope", { status: 404 })]);
    await expect(api.get(2026, "events")).rejects.toBeInstanceOf(FtcApiError);
    expect(api.requests).toBe(1);
  });

  it("treats HTML / empty bodies as no data", () => {
    expect(parseJsonBody("<!DOCTYPE html><html>", "text/html")).toBeNull();
    expect(parseJsonBody("   ", "application/json")).toBeNull();
  });
});
