import { describe, expect, it } from "vitest";
import {
  ALL_SEASONS,
  correctedStat,
  correctionFor,
  getSeason,
  OFFICIAL_KINDS,
  SEASON_KINDS,
  scoreColumns,
  seasonKindIn,
  weekOf,
} from "./index";

describe("season descriptors", () => {
  it("covers 2019 through 2026, newest first", () => {
    expect(ALL_SEASONS).toEqual([2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019]);
  });

  it("maps BIOBUZZ scores into generic columns", () => {
    const row = scoreColumns(getSeason(2026), {
      autoPoints: 31,
      teleopPoints: 122,
      preFoulTotal: 153,
      totalPoints: 158,
      teleopParkPoints: 5,
      foulPointsCommitted: 5,
      autoHiveTips: 1,
      teleopHiveTips: 4,
      teleopHivePoints: 92,
      teleopFlowerPoints: 22,
      teleopGardenPoints: 3,
    });
    expect(row).toMatchObject({
      auto: 31,
      teleop: 122,
      endgame: 5,
      np: 153,
      total: 158,
      fouls: 5,
      c1: 5,
      c2: 92,
    });
  });

  it("caps over-counted CELL pieces at KZASN1 and rescores", () => {
    const fix = correctionFor(2026, "KZASN1");
    // KZASN1 Q1 red as reported: 2 tips + 25 pieces = 90 HIVE points.
    const reported = {
      autoPoints: 76,
      teleopHiveTips: 2,
      teleopHivePollenNectar: 25,
      teleopHivePoints: 90,
      teleopPoints: 95,
      preFoulTotal: 171,
      totalPoints: 191,
    };
    const fixed = fix?.apply(reported);
    expect(fixed).toMatchObject({
      teleopHivePollenNectar: 8,
      teleopHivePoints: 56,
      teleopPoints: 61,
      preFoulTotal: 137,
      totalPoints: 157,
      reportedHivePollenNectar: 25,
    });
    expect(scoreColumns(getSeason(2026), fixed ?? {})).toMatchObject({ np: 137, total: 157, c2: 56 });
    expect(fix?.apply({ ...reported, teleopHivePollenNectar: 8 })).toBeNull();
    expect(correctionFor(2026, "USCHSUBQ1")).toBeUndefined();
    expect(correctedStat(2026, "KZASN1", "np")).toBe(true);
    expect(correctedStat(2026, "KZASN1", "auto")).toBe(false);
  });

  it("rebuilds the SKYSTONE endgame the API reports as 0", () => {
    // Real 2019 alliance: 66 auto + 48 driver-controlled + capstone 15 + foundation 15 + one robot parked 5.
    const sky = scoreColumns(getSeason(2019), {
      autonomousPoints: 66,
      driverControlledPoints: 48,
      endGamePoints: 0,
      parkingPoints: 0,
      capstonePoints: 15,
      foundationMoved: true,
      robot1Parked: true,
      robot2Parked: false,
      totalPoints: 149,
      minorPenalties: 1,
      majorPenalties: 0,
    });
    expect(sky).toMatchObject({ auto: 66, endgame: 35, np: 149, teleop: 83, total: 149, fouls: 5 });
  });

  it("tolerates missing fields", () => {
    const row = scoreColumns(getSeason(2022), {});
    expect(row.np).toBe(0);
  });

  it("keeps the events-list Official set free of scrimmages, and counts non-advancement in season stats", () => {
    expect([...OFFICIAL_KINDS]).toEqual([
      "LeagueMeet",
      "Qualifier",
      "LeagueTournament",
      "Championship",
      "FIRSTChampionship",
      "SuperQualifier",
      "Premier",
      "Pilot",
    ]);
    expect(SEASON_KINDS).toContain("NonAdvancement");
    expect(SEASON_KINDS).toContain("Scrimmage");
    expect(seasonKindIn("e")).not.toContain("OffSeason");
  });

  it("numbers weeks from the Monday before kickoff", () => {
    const d = getSeason(2026); // kickoff Sat 2026-09-12 → week 1 starts Mon 09-07
    expect(weekOf(d, "2026-09-07")).toBe(1);
    expect(weekOf(d, "2026-09-13")).toBe(1);
    expect(weekOf(d, "2026-09-14")).toBe(2);
    expect(weekOf(d, "2026-10-17T00:00:00")).toBe(6);
  });
});
