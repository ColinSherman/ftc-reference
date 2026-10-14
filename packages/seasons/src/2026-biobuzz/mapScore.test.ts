import type { ApiAlliance2026 } from "@ftcref/ftc-api";
import { describe, expect, it } from "vitest";
import { flowerFacts, mapAlliance2026 } from "./mapScore";

const red: ApiAlliance2026 = {
  alliance: "Red",
  team: 0,
  autoRobot1Leave: true,
  autoRobot2Leave: true,
  autoRobot1Park: false,
  autoRobot2Park: true,
  autoHiveTips: 1,
  autoLeavePoints: 6,
  autoParkPoints: 5,
  autoHivePoints: 20,
  autoPoints: 31,
  teleopHiveTips: 4,
  teleopHivePollenNectar: 6,
  teleopGardenPollenNectar: 3,
  redAllianceFlower: ["RED_NECTAR", "POLLEN", "RED_NECTAR"],
  blueAllianceFlower: ["BLUE_NECTAR", "POLLEN"],
  scoringFlower: ["BLUE_NECTAR", "POLLEN", "RED_NECTAR"],
  audienceFlower: null,
  teleopRobot1Park: true,
  teleopRobot2Park: false,
  teleopHivePoints: 92,
  teleopFlowerPoints: 22,
  teleopGardenPoints: 3,
  teleopParkPoints: 5,
  teleopPoints: 122,
  majorFouls: 0,
  minorFouls: 1,
  foulPointsCommitted: 5,
  preFoulTotal: 153,
  totalPoints: 153,
  swarmRP: false,
  pollinator1RP: true,
  pollinator2RP: false,
};

describe("mapAlliance2026", () => {
  it("maps fields and encodes flowers", () => {
    const row = mapAlliance2026(red);
    expect(row.alliance).toBe("R");
    expect(row.flower_red).toBe("RPR");
    expect(row.flower_audience).toBe("");
    expect(row.total_tips).toBe(5);
    expect(row.pollinator1_rp).toBe(1);
    expect(row.auto_r1_park).toBe(0);
  });

  it("derives flower ownership and bottom-nectar bonuses", () => {
    expect(flowerFacts(["RPR", "BP", "BPR", ""], "R")).toEqual({
      flowers_owned: 2,
      flower_pieces: 6,
      bottom_nectar_bonuses: 1,
    });
    expect(flowerFacts(["RPR", "BP", "BPR", ""], "B")).toEqual({
      flowers_owned: 1,
      flower_pieces: 2,
      bottom_nectar_bonuses: 2,
    });
  });
});
