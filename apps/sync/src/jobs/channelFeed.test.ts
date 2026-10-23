import { afterEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../env";
import { channelRss } from "./channelFeed";

function fakeEnv() {
  const writes: { sql: string; args: unknown[] }[] = [];
  const DB = {
    prepare(sql: string) {
      return {
        bind: (...args: unknown[]) => ({
          run: async () => {
            writes.push({ sql, args });
          },
        }),
      };
    },
  };
  return { env: { DB } as unknown as Env, writes };
}

const FEED = `<?xml version="1.0"?><feed xmlns:yt="http://www.youtube.com/xml/schemas/2015"><entry>
<yt:videoId>abc123def45</yt:videoId><title>Q1</title><published>2026-10-20T00:00:00+00:00</published></entry></feed>`;

afterEach(() => vi.unstubAllGlobals());

describe("channelRss", () => {
  it("records a failing feed on the channel and returns null instead of throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 404 })),
    );
    const { env, writes } = fakeEnv();
    expect(await channelRss(env, "UCdead")).toBeNull();
    expect(writes).toHaveLength(1);
    expect(writes[0]?.sql).toContain("SET last_error = ?");
    expect(writes[0]?.args).toEqual(["YouTube RSS 404", expect.any(String), "UCdead"]);
  });

  it("returns the uploads and clears a previous error on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(FEED, { status: 200 })),
    );
    const { env, writes } = fakeEnv();
    const videos = await channelRss(env, "UCok");
    expect(videos?.map((v) => v.videoId)).toEqual(["abc123def45"]);
    expect(writes[0]?.sql).toContain("SET last_error = NULL");
  });
});
