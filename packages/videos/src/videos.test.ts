import { describe, expect, it } from "vitest";
import { parseTitle, parseYoutubeSource, parseYoutubeUrl } from "./parse";
import { matchKey, planImport } from "./plan";
import { resolveEvent } from "./resolve";

const ref = (t: string) => {
  const p = parseTitle(t);
  return p.kind === "match" ? p.ref : p.kind;
};

describe("parseTitle", () => {
  it("handles the Team 4201 League H format", () => {
    expect(ref("SoCal FTC Group H - Scrimmage  3 - Q22")).toEqual({ level: "Q", series: 0, number: 22 });
    expect(ref("SoCal FTC Group H 2025 - Scrimmage 2 - Q1")).toEqual({ level: "Q", series: 0, number: 1 });
    expect(ref("SoCal FTC Group H - Scrimmage  3 - T-1")).toBe("test");
    const p = parseTitle("SoCal FTC Group H 2025 - Scrimmage 2 - Q23");
    expect(p.eventText).toBe("SoCal FTC Group H 2025 Scrimmage 2");
  });

  it("handles common qualification spellings", () => {
    for (const t of [
      "Qual 12",
      "Qualification Match 12",
      "QM12",
      "Q-12",
      "Quals Match #12",
      "Match 12 - Texas",
    ]) {
      expect(ref(t)).toEqual({ level: "Q", series: 0, number: 12 });
    }
  });

  it("handles playoffs, semis and finals", () => {
    expect(ref("Playoff Match 3 | Ohio Championship")).toEqual({ level: "P", series: 3, number: 1 });
    expect(ref("M-7 Upper bracket")).toEqual({ level: "P", series: 7, number: 1 });
    expect(ref("SF1-2 Worlds")).toEqual({ level: "SF", series: 1, number: 2 });
    expect(ref("Semifinal 2 Match 1")).toEqual({ level: "SF", series: 2, number: 1 });
    expect(ref("Finals Match 2")).toEqual({ level: "F", series: 1, number: 2 });
    expect(ref("F-1")).toEqual({ level: "F", series: 1, number: 1 });
  });

  it("does not mistake words for matches", () => {
    expect(ref("FTC League H - Meet 1")).toBe("none");
    expect(ref("Team 4201 Impact Video")).toBe("none");
  });
});

describe("YouTube URLs", () => {
  it("parses ids and timestamps", () => {
    expect(parseYoutubeUrl("https://youtu.be/C7KZm2lHzF8")).toEqual({ id: "C7KZm2lHzF8" });
    expect(parseYoutubeUrl("https://www.youtube.com/watch?v=VCdy7Fs7BvI&t=1h2m3s")).toEqual({
      id: "VCdy7Fs7BvI",
      start: 3723,
    });
    expect(parseYoutubeUrl("youtube.com/live/VCdy7Fs7BvI?t=754")).toEqual({ id: "VCdy7Fs7BvI", start: 754 });
    expect(parseYoutubeUrl("not a url")).toBeNull();
  });
  it("parses playlist / channel sources", () => {
    expect(
      parseYoutubeSource("https://www.youtube.com/playlist?list=PL7MAsPdpLDTxGWsLe0-JVte3DtmnKvEVB"),
    ).toEqual({
      kind: "playlist",
      id: "PL7MAsPdpLDTxGWsLe0-JVte3DtmnKvEVB",
    });
    expect(parseYoutubeSource("https://www.youtube.com/@Team4201/videos")).toEqual({
      kind: "handle",
      handle: "Team4201",
    });
  });
});

const EVENTS = [
  {
    season: 2025,
    code: "USCALACALAM1",
    name: "SoCal FTC Group H - Scrimmage 1",
    date_start: "2025-11-15",
    date_end: "2025-11-15",
  },
  {
    season: 2025,
    code: "USCALACALAM2",
    name: "SoCal FTC Group H - Scrimmage 2",
    date_start: "2025-12-06",
    date_end: "2025-12-06",
  },
  {
    season: 2025,
    code: "USCALACALAM3",
    name: "SoCal FTC Group H - Scrimmage  3",
    date_start: "2025-12-20",
    date_end: "2025-12-20",
  },
  {
    season: 2025,
    code: "USCALAGRM1",
    name: "SoCal FTC Group G - Scrimmage 2",
    date_start: "2025-12-06",
    date_end: "2025-12-06",
  },
];

describe("resolveEvent", () => {
  it("picks the right meet in a series", () => {
    expect(resolveEvent("SoCal FTC Group H 2025 Scrimmage 2", EVENTS)?.event.code).toBe("USCALACALAM2");
    expect(resolveEvent("SoCal FTC Group H Scrimmage 3", EVENTS)?.event.code).toBe("USCALACALAM3");
  });
  it("prefers an explicit event code", () => {
    expect(resolveEvent("whatever USCALACALAM1", EVENTS)?.event.code).toBe("USCALACALAM1");
  });
});

describe("planImport", () => {
  const quals = new Set(
    EVENTS.flatMap((e) =>
      Array.from({ length: 23 }, (_, i) => matchKey(e.code, { level: "Q", series: 0, number: i + 1 })),
    ),
  );
  const vid = (title: string) => ({
    videoId: "x",
    title,
    publishedAt: "2025-12-07T00:00:00Z",
    channelId: "UCH0bRF8xOOJxtD6JOYX7TSQ",
    channelTitle: "Team 4201",
  });
  it("maps a playlist to one event with high confidence", () => {
    const plan = planImport(
      [vid("SoCal FTC Group H 2025 - Scrimmage 2 - Q23"), vid("SoCal FTC Group H 2025 - Scrimmage 2 - T-1")],
      EVENTS,
      (k) => quals.has(k),
      { playlistTitle: "SoCal FTC Group H 2025 - Scrimmage 2" },
    );
    expect(plan[0]).toMatchObject({ confidence: "high", matchFound: true, event: { code: "USCALACALAM2" } });
    expect(plan[1]).toMatchObject({ confidence: "none", reason: "test/practice match" });
  });
  it("flags matches that don't exist", () => {
    const [p] = planImport([vid("SoCal FTC Group H 2025 - Scrimmage 2 - Q99")], EVENTS, (k) => quals.has(k));
    expect(p?.confidence).toBe("none");
  });
});

describe("resolveEvent with odd event codes", () => {
  it("does not choke on codes containing regex characters", () => {
    const odd = [
      ...EVENTS,
      {
        season: 2025,
        code: "USVTM(KO",
        name: "Vermont Kickoff",
        date_start: "2025-09-06",
        date_end: "2025-09-06",
      },
    ];
    expect(resolveEvent("SoCal FTC Group H 2025 Scrimmage 2", odd)?.event.code).toBe("USCALACALAM2");
    expect(resolveEvent("Vermont USVTM(KO day", odd)?.event.code).toBe("USVTM(KO");
  });
});

describe("noise filters", () => {
  it("ignores other FIRST programs", () => {
    expect(ref("Da Vinci FLL Qualifying Tournament 2025 - Qualification 1")).toBe("none");
    expect(ref("FRC 2016 LA Regional Q12")).toBe("none");
  });
  it("never matches events far from the video date", () => {
    const old = { ...EVENTS[1], date_start: "2019-12-06", date_end: "2019-12-06" } as (typeof EVENTS)[number];
    expect(resolveEvent("SoCal FTC Group H Scrimmage 2", [old], { date: "2025-12-07" })).toBeNull();
    expect(resolveEvent("SoCal FTC Group H Scrimmage 2", [old], { date: "2019-12-07" })?.event.code).toBe(
      "USCALACALAM2",
    );
  });
});
