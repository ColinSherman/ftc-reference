import { describe, expect, it } from "vitest";
import {
  type BoxReport,
  type BoxTeamIn,
  biobuzzBox,
  buildBoxScore,
  compileLog,
  getSeason,
  parseScoutForm,
} from "./index";

const teams: BoxTeamIn[] = [
  {
    alliance: "R",
    station: "Red1",
    team: 11111,
    name: "Alpha",
    av: null,
    surrogate: false,
    dq: false,
    noShow: false,
  },
  {
    alliance: "R",
    station: "Red2",
    team: 22222,
    name: "Beta",
    av: null,
    surrogate: false,
    dq: false,
    noShow: false,
  },
  {
    alliance: "B",
    station: "Blue1",
    team: 33333,
    name: "Gamma",
    av: null,
    surrogate: false,
    dq: false,
    noShow: false,
  },
  {
    alliance: "B",
    station: "Blue2",
    team: 44444,
    name: "Delta",
    av: null,
    surrogate: false,
    dq: false,
    noShow: false,
  },
];

const official = {
  autoRobot1Leave: true,
  autoRobot2Leave: true,
  autoRobot1Park: false,
  autoRobot2Park: true,
  teleopRobot1Park: true,
  teleopRobot2Park: false,
  autoHiveTips: 1,
  teleopHiveTips: 3,
  minorFouls: 1,
  majorFouls: 0,
};

const card = (partial: Partial<BoxReport> & Pick<BoxReport, "team" | "line">): BoxReport => ({
  id: partial.id ?? 1,
  team: partial.team,
  by: partial.by ?? null,
  mode: partial.mode ?? "line",
  line: partial.line,
  qual: partial.qual ?? {},
  log: partial.log ?? [],
  createdAt: partial.createdAt ?? "2026-10-17T21:00:00.000Z",
});

describe("BIOBUZZ box score", () => {
  it("is the only season that takes scout cards, and every action writes a real column", () => {
    expect(getSeason(2026).box).toBe(biobuzzBox);
    expect(getSeason(2025).box).toBeUndefined();
    const keys = new Set(biobuzzBox.columns.flatMap((c) => [c.key, ...(c.parts ?? [])]));
    for (const action of biobuzzBox.actions) {
      expect(biobuzzBox.trackGroups.some((g) => g.key === action.group)).toBe(true);
      for (const add of action.adds) expect(keys.has(add.column)).toBe(true);
    }
  });

  it("rolls a play-by-play into the same columns, with zeros for groups that were watched", () => {
    const line = compileLog(
      biobuzzBox,
      [
        { period: "tele", action: "pollen", where: "red" },
        { period: "tele", action: "nectar", where: "scoring" },
        { period: "tele", action: "nectar", where: "audience" },
        { period: "tele", action: "minor" },
      ],
      ["flower", "foul"],
    );
    expect(line).toMatchObject({
      flower_pollen: 1,
      flower_nectar: 2,
      flower_miss: 0,
      minor: 1,
      major: 0,
    });
    expect(line.garden).toBeUndefined();
    expect(line.auto_tips).toBeUndefined();
    expect(line.tele_tips).toBeUndefined();
  });

  it("keeps a blank tally blank and treats an explicit zero as a zero", () => {
    const blank = parseScoutForm(biobuzzBox, [11111], { team: "11111", mode: "line", by: "  " }, []);
    expect(blank.ok).toBe(false);

    const quick = parseScoutForm(
      biobuzzBox,
      [11111],
      {
        team: "11111",
        mode: "line",
        c_auto_leave: "1",
        c_auto_tips: "0",
        c_flower: "4",
        q_defense: "primary",
        note: "fast cycles",
        by: " 4201 ",
      },
      [],
    );
    expect(quick.ok).toBe(true);
    if (!quick.ok) return;
    expect(quick.value.by).toBe("4201");
    expect(quick.value.line).toEqual({ auto_leave: 1, flower: 4 });
    expect(quick.value.line.auto_tips).toBeUndefined();
    expect(quick.value.qual).toEqual({});
  });

  it("lets a split flower count replace the single total", () => {
    const split = parseScoutForm(
      biobuzzBox,
      [11111],
      { team: "11111", mode: "line", c_flower: "9", c_flower_pollen: "3", c_flower_nectar: "1" },
      [],
    );
    expect(split.ok).toBe(true);
    if (!split.ok) return;
    expect(split.value.line.flower).toBeUndefined();
    expect(split.value.line).toMatchObject({ flower_pollen: 3, flower_nectar: 1 });
  });

  it("compiles a play-by-play and still keeps leave and park from the line", () => {
    const log = parseScoutForm(
      biobuzzBox,
      [11111],
      {
        team: "11111",
        mode: "log",
        c_auto_leave: "1",
        c_tele_park: "0",
        log: JSON.stringify([
          { period: "tele", action: "nectar", where: "scoring" },
          { period: "auto", action: "pollen" },
        ]),
      },
      ["flower"],
    );
    expect(log.ok).toBe(true);
    if (!log.ok) return;
    expect(log.value.line).toMatchObject({
      auto_leave: 1,
      tele_park: 0,
      flower_pollen: 1,
      flower_nectar: 1,
      flower_miss: 0,
    });
    expect(log.value.line.auto_tips).toBeUndefined();
    expect(log.value.qual).toEqual({});
    expect(log.value.log).toHaveLength(2);
  });

  it("rejects a tip action, because tip counts come from the official score", () => {
    const log = parseScoutForm(
      biobuzzBox,
      [11111],
      { team: "11111", mode: "log", log: JSON.stringify([{ period: "tele", action: "tip" }]) },
      ["flower"],
    );
    expect(log.ok).toBe(false);
  });

  it("shows official leave and park until a scout records them, and flags a disagreement", () => {
    const table = buildBoxScore(
      biobuzzBox,
      teams,
      [
        card({
          team: 11111,
          line: { auto_leave: 0, auto_tips: 1, tele_tips: 2 },
        }),
      ],
      { R: official, B: official },
      true,
    );
    const red = table.sides[0];
    expect(red?.label).toBe("Red");
    const alpha = red?.robots[0];
    expect(alpha?.cells[0]).toMatchObject({ text: "·", cls: "clash" });
    expect(alpha?.cells[1]).toMatchObject({ text: "·", cls: "off" });
    expect(alpha?.cells[2]).toMatchObject({ text: "–", cls: "blank" });
    expect(alpha?.sub).toBe("");
    expect(alpha?.credit).toBe("5");

    const beta = red?.robots[1];
    expect(beta?.cells[0]).toMatchObject({ text: "✓", cls: "off" });
    expect(beta?.credit).toBe("8");

    expect(red?.totals[2]).toMatchObject({ text: "1", cls: "off", title: "Official scorekeeper" });
    expect(red?.totals[3]).toMatchObject({ text: "3", cls: "off" });
  });

  it("keeps hive tips on the official total and reconciles fouls the scouts counted", () => {
    const table = buildBoxScore(
      biobuzzBox,
      teams,
      [
        card({ id: 1, team: 11111, line: { auto_tips: 4, minor: 1 } }),
        card({ id: 2, team: 22222, line: { tele_tips: 9, minor: 1 } }),
        card({ id: 3, team: 11111, by: "other", line: { minor: 3 } }),
      ],
      { R: official },
      true,
    );
    const red = table.sides[0];
    // Median of minor fouls 1 and 3 is 2, so alpha shows 2 and the scouts-differ mark.
    expect(red?.robots[0]?.cells[7]).toMatchObject({ text: "2", cls: "split" });
    expect(red?.robots[0]?.cells[2]).toMatchObject({ text: "–" });
    // Both red robots were scouted: 2 + 1 = 3, official minor fouls are 1.
    expect(red?.totals[7]).toMatchObject({ text: "3", cls: "clash", title: "Scouted 3, official 1" });
    expect(red?.totals[2]).toMatchObject({ text: "1", cls: "off" });
    expect(red?.totals[3]).toMatchObject({ text: "3", cls: "off" });
    expect(table.cards[0]?.summary).not.toContain("tips");
    expect(table.cards[0]?.summary).toContain("1 minor fouls");
  });

  it("prints a pollen + nectar split in the one flower column", () => {
    const table = buildBoxScore(
      biobuzzBox,
      teams.slice(0, 1),
      [
        card({
          team: 11111,
          mode: "log",
          line: { flower_pollen: 3, flower_nectar: 1, flower_miss: 2 },
          qual: { defense: "some", broke: 1, note: "fast cycles" },
        }),
      ],
      {},
      false,
    );
    const flower = table.sides[0]?.robots[0];
    expect(flower?.cells.find((c) => c.text === "3+1")).toMatchObject({
      num: 4,
      title: "3 pollen · 1 nectar",
    });
    expect(flower?.sub).toBe("flower miss 2");
  });

  it("leaves a watched group that scored nothing off the note line", () => {
    const table = buildBoxScore(
      biobuzzBox,
      teams.slice(0, 1),
      [
        card({
          team: 11111,
          mode: "log",
          line: { flower_miss: 0, garden: 0, tele_tips: 2 },
        }),
      ],
      {},
      false,
    );
    const row = table.sides[0]?.robots[0];
    expect(row?.sub).toBe("");
    expect(row?.cells.some((c) => c.text === "0")).toBe(true);
    expect(row?.cells.some((c) => c.text === "2")).toBe(false);
  });
});
