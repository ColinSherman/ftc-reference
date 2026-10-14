// BIOBUZZ (2026) per-alliance score detail from /scores/{event}/{qual|playoff}.

export type FlowerPiece = "RED_NECTAR" | "BLUE_NECTAR" | "POLLEN";

export interface ApiAlliance2026 {
  alliance: "Red" | "Blue";
  team: number;
  autoRobot1Leave: boolean;
  autoRobot2Leave: boolean;
  autoRobot1Park: boolean;
  autoRobot2Park: boolean;
  autoHiveTips: number;
  autoLeavePoints: number;
  autoParkPoints: number;
  autoHivePoints: number;
  autoPoints: number;
  teleopHiveTips: number;
  teleopHivePollenNectar: number;
  teleopGardenPollenNectar: number;
  redAllianceFlower: FlowerPiece[] | null;
  blueAllianceFlower: FlowerPiece[] | null;
  scoringFlower: FlowerPiece[] | null;
  audienceFlower: FlowerPiece[] | null;
  teleopRobot1Park: boolean;
  teleopRobot2Park: boolean;
  teleopHivePoints: number;
  teleopFlowerPoints: number;
  teleopGardenPoints: number;
  teleopParkPoints: number;
  teleopPoints: number;
  majorFouls: number;
  minorFouls: number;
  foulPointsCommitted: number;
  preFoulTotal: number;
  totalPoints: number;
  swarmRP: boolean;
  pollinator1RP: boolean;
  pollinator2RP: boolean;
}
