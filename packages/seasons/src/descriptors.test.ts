import { describe, expect, it } from "vitest";
import { ALL_SEASONS, getSeason, scoreColumns, weekOf } from "./index";

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

  it("computes NP for seasons without a pre-penalty total", () => {
    const sky = scoreColumns(getSeason(2019), {
      autonomousPoints: 20,
      driverControlledPoints: 40,
      endGamePoints: 15,
      totalPoints: 95,
      minorPenalties: 1,
      majorPenalties: 0,
    });
    expect(sky).toMatchObject({ np: 75, teleop: 55, total: 95, fouls: 5 });
  });

  it("tolerates missing fields", () => {
    const row = scoreColumns(getSeason(2022), {});
    expect(row.np).toBe(0);
  });

  it("numbers weeks from the Monday before kickoff", () => {
    const d = getSeason(2026); // kickoff Sat 2026-09-12 → week 1 starts Mon 09-07
    expect(weekOf(d, "2026-09-07")).toBe(1);
    expect(weekOf(d, "2026-09-13")).toBe(1);
    expect(weekOf(d, "2026-09-14")).toBe(2);
    expect(weekOf(d, "2026-10-17T00:00:00")).toBe(6);
  });
});
