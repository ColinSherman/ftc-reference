import { describe, expect, it } from "vitest";
import { alignMatches, LEAD_S, localToUtcMs } from "./align";
import { isoDurationToSeconds, parseRss } from "./youtube";

describe("time zones", () => {
  it("converts event-local wall clock to UTC (PST in December, PDT in October)", () => {
    expect(new Date(localToUtcMs("2025-12-06T11:34:22.091", "America/Los_Angeles")).toISOString()).toBe(
      "2025-12-06T19:34:22.091Z",
    );
    expect(new Date(localToUtcMs("2025-10-18T09:00:00", "America/Los_Angeles")).toISOString()).toBe(
      "2025-10-18T16:00:00.000Z",
    );
    expect(new Date(localToUtcMs("2025-10-18T09:00:00", null)).toISOString()).toBe(
      "2025-10-18T09:00:00.000Z",
    );
  });
});

describe("alignMatches", () => {
  const stream = {
    videoId: "Ec8eZNzaGJY",
    startMs: Date.parse("2025-12-06T18:00:00Z"),
    endMs: Date.parse("2025-12-07T01:00:00Z"),
  };
  it("places matches inside the stream with a lead-in and drops the rest", () => {
    const { aligned, fit } = alignMatches(
      [
        { id: 1, actual_start_at: "2025-12-06T11:34:22" }, // 19:34:22Z → 1h34m22s in
        { id: 2, actual_start_at: "2025-12-07T09:00:00" }, // next day: outside
        { id: 3, actual_start_at: null },
      ],
      stream,
      "America/Los_Angeles",
    );
    expect(aligned).toEqual([{ matchId: 1, startS: 5662 - LEAD_S }]);
    expect(fit).toBe(0.5);
  });
});

describe("parsers", () => {
  it("reads ISO durations", () => {
    expect(isoDurationToSeconds("PT3H17M30S")).toBe(11850);
    expect(isoDurationToSeconds("PT45S")).toBe(45);
    expect(isoDurationToSeconds(undefined)).toBeNull();
  });
  it("reads YouTube RSS", () => {
    const xml = `<feed><author><name>Team 4201</name></author><entry><yt:videoId>kGaIk83S8vQ</yt:videoId>
      <yt:channelId>UCH0bRF8xOOJxtD6JOYX7TSQ</yt:channelId><title>SoCal FTC Group H - Scrimmage 2 - Q3 &amp; more</title>
      <published>2025-12-07T20:51:01+00:00</published></entry></feed>`;
    expect(parseRss(xml)).toEqual([
      {
        videoId: "kGaIk83S8vQ",
        title: "SoCal FTC Group H - Scrimmage 2 - Q3 & more",
        publishedAt: "2025-12-07T20:51:01+00:00",
        channelId: "UCH0bRF8xOOJxtD6JOYX7TSQ",
        channelTitle: "Team 4201",
      },
    ]);
  });
});
