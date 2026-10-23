import { describe, expect, it } from "vitest";
import { clip, eventMeta, matchMeta, teamMeta } from "./meta";

const ev = {
  name: "Fresno Qualifier",
  type_name: "Qualifier",
  city: "Fresno",
  state_prov: "CA",
  country: "USA",
  date_start: "2026-10-17T00:00:00",
  date_end: "2026-10-18T00:00:00",
  remote: 0,
};

describe("clip", () => {
  it("leaves short text and trims long text at a word", () => {
    expect(clip("short")).toBe("short");
    const long = `${"word ".repeat(60)}end`;
    const out = clip(long);
    expect(out.length).toBeLessThanOrEqual(158);
    expect(out.endsWith("…")).toBe(true);
    expect(out).not.toMatch(/ …$/);
  });
});

describe("eventMeta", () => {
  it("includes season, game, location and match status", () => {
    const m = eventMeta(ev, "BIOBUZZ", "2026–27", 30, 60);
    expect(m.title).toBe("Fresno Qualifier 2026–27 BIOBUZZ Results");
    expect(m.description).toContain("Fresno, CA, USA");
    expect(m.description).toContain("30 of 60 matches played");
    expect(m.description).toContain("2026-10-17 to 2026-10-18");
  });
  it("handles an event with no schedule and remote events", () => {
    expect(eventMeta(ev, "G", "S", 0, 0).description).toContain("Schedule not posted yet");
    const r = eventMeta({ ...ev, remote: 1 }, "G", "S", 0, 4);
    expect(r.description).toContain("Qualifier, remote");
    expect(r.description).not.toContain(" in Fresno");
    expect(r.description).toContain("4 matches scheduled");
  });
});

describe("teamMeta", () => {
  const t = {
    number: 4201,
    name: "Vitruvian Bots",
    city: "Troy",
    state_prov: "MI",
    country: "USA",
    rookie_year: 2012,
  };
  it("summarises the latest season", () => {
    const m = teamMeta(t, 12, {
      seasonName: "2026–27",
      game: "BIOBUZZ",
      events: 2,
      wins: 9,
      losses: 3,
      ties: 0,
      bestOpr: 88.44,
    });
    expect(m.title).toBe("FTC Team 4201 Vitruvian Bots – Troy, MI, USA");
    expect(m.description).toContain("9-3-0 at 2 events, best OPR 88.4");
  });
  it("copes with missing data", () => {
    const m = teamMeta(
      { ...t, name: null, city: null, state_prov: null, country: null, rookie_year: null },
      1,
      null,
    );
    expect(m.title).toBe("FTC Team 4201");
    expect(m.description).toContain("Stats for 1 season.");
  });
});

describe("matchMeta", () => {
  it("reports the result and alliances", () => {
    const m = matchMeta(
      "Q12",
      "Fresno Qualifier",
      "BIOBUZZ",
      "2026–27",
      { played: true, remote: false, red: 120, blue: 98, winner: "R" },
      [1, 2],
      [3, 4],
    );
    expect(m.description).toContain("Red wins 120–98");
    expect(m.description).toContain("Red 1 & 2 vs Blue 3 & 4");
  });
  it("describes an unplayed match without a result", () => {
    const m = matchMeta(
      "Q12",
      "E",
      "G",
      "S",
      { played: false, remote: false, red: null, blue: null, winner: null },
      [1, 2],
      [3, 4],
    );
    expect(m.description).not.toMatch(/wins|Tie/);
  });
});
