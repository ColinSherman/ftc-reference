import type { ApiAlliance2026, FlowerPiece } from "@ftcref/ftc-api";

const PIECE_CODE: Record<FlowerPiece, string> = { RED_NECTAR: "R", BLUE_NECTAR: "B", POLLEN: "P" };

/** Encode a flower stack (API order, assumed bottom → top) as e.g. "PRPB". */
export const encodeFlower = (f: FlowerPiece[] | null | undefined) =>
  (f ?? []).map((p) => PIECE_CODE[p]).join("");

/**
 * Derived flower facts for one alliance. These are convenience columns for leaderboards;
 * the official point totals always come from the API's own *Points fields.
 *  - owner: alliance whose NECTAR is top-most in the flower
 *  - bottom-nectar bonus: alliance whose NECTAR is lowest in the flower
 */
export function flowerFacts(flowers: string[], ally: "R" | "B") {
  let owned = 0;
  let pieces = 0;
  let bonuses = 0;
  for (const f of flowers) {
    const nectar = [...f].filter((c) => c === "R" || c === "B");
    if (nectar.length === 0) continue;
    if (nectar[nectar.length - 1] === ally) {
      owned++;
      pieces += f.length;
    }
    if (nectar[0] === ally) bonuses++;
  }
  return { flowers_owned: owned, flower_pieces: pieces, bottom_nectar_bonuses: bonuses };
}

const b = (v: boolean | null | undefined) => (v ? 1 : 0);
const n = (v: number | null | undefined) => v ?? 0;

/** API alliance JSON → s2026_match_scores row (minus match_id / updated_at). */
export function mapAlliance2026(a: ApiAlliance2026) {
  const ally = a.alliance === "Red" ? "R" : "B";
  const flowers = {
    flower_red: encodeFlower(a.redAllianceFlower),
    flower_blue: encodeFlower(a.blueAllianceFlower),
    flower_scoring: encodeFlower(a.scoringFlower),
    flower_audience: encodeFlower(a.audienceFlower),
  };
  return {
    alliance: ally,
    auto_r1_leave: b(a.autoRobot1Leave),
    auto_r2_leave: b(a.autoRobot2Leave),
    auto_r1_park: b(a.autoRobot1Park),
    auto_r2_park: b(a.autoRobot2Park),
    auto_hive_tips: n(a.autoHiveTips),
    auto_leave_pts: n(a.autoLeavePoints),
    auto_park_pts: n(a.autoParkPoints),
    auto_hive_pts: n(a.autoHivePoints),
    auto_pts: n(a.autoPoints),
    teleop_hive_tips: n(a.teleopHiveTips),
    teleop_hive_pieces: n(a.teleopHivePollenNectar),
    teleop_garden_pieces: n(a.teleopGardenPollenNectar),
    teleop_r1_park: b(a.teleopRobot1Park),
    teleop_r2_park: b(a.teleopRobot2Park),
    ...flowers,
    teleop_hive_pts: n(a.teleopHivePoints),
    teleop_flower_pts: n(a.teleopFlowerPoints),
    teleop_garden_pts: n(a.teleopGardenPoints),
    teleop_park_pts: n(a.teleopParkPoints),
    teleop_pts: n(a.teleopPoints),
    major_fouls: n(a.majorFouls),
    minor_fouls: n(a.minorFouls),
    foul_pts_committed: n(a.foulPointsCommitted),
    pre_foul_total: n(a.preFoulTotal),
    total_pts: n(a.totalPoints),
    swarm_rp: b(a.swarmRP),
    pollinator1_rp: b(a.pollinator1RP),
    pollinator2_rp: b(a.pollinator2RP),
    total_tips: n(a.autoHiveTips) + n(a.teleopHiveTips),
    ...flowerFacts(Object.values(flowers), ally),
  };
}

export type Score2026Row = ReturnType<typeof mapAlliance2026>;
