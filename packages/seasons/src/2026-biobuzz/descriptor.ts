import type { Score2026Row } from "./mapScore";

/** A per-alliance quantity we run OPR on. `col` names the s2026_team_event_stats column. */
export interface OprComponent {
  col: string;
  label: string;
  value: (s: Score2026Row) => number;
}

export const biobuzz = {
  season: 2026,
  name: "BIOBUZZ",
  scoreTable: "s2026_match_scores",
  /** The no-penalty total is the headline stat (like FTCScout's "NP OPR"). */
  oprComponents: [
    { col: "opr_np", label: "NP", value: (s) => s.pre_foul_total },
    { col: "opr_total", label: "Total", value: (s) => s.total_pts },
    { col: "opr_auto", label: "Auto", value: (s) => s.auto_pts },
    { col: "opr_teleop", label: "TeleOp", value: (s) => s.teleop_pts },
    { col: "opr_tips", label: "Tips", value: (s) => s.total_tips },
    { col: "opr_hive", label: "Hive", value: (s) => s.teleop_hive_pts },
    { col: "opr_flower", label: "Flower", value: (s) => s.teleop_flower_pts },
    { col: "opr_garden", label: "Garden", value: (s) => s.teleop_garden_pts },
    { col: "opr_park", label: "Park", value: (s) => s.auto_park_pts + s.teleop_park_pts + s.auto_leave_pts },
    { col: "opr_fouls", label: "Fouls", value: (s) => s.foul_pts_committed },
  ] satisfies OprComponent[],
  /** Rows of the match breakdown table: [label, column, isSubtotal]. */
  breakdown: [
    ["Auto LEAVE", "auto_leave_pts", false],
    ["Auto PARK", "auto_park_pts", false],
    ["Auto HIVE tips", "auto_hive_tips", false],
    ["Auto HIVE points", "auto_hive_pts", false],
    ["Auto total", "auto_pts", true],
    ["TeleOp HIVE tips", "teleop_hive_tips", false],
    ["TeleOp HIVE points", "teleop_hive_pts", false],
    ["Pieces in CELLs", "teleop_hive_pieces", false],
    ["FLOWER points", "teleop_flower_pts", false],
    ["FLOWERS owned", "flowers_owned", false],
    ["GARDEN pieces", "teleop_garden_pieces", false],
    ["GARDEN points", "teleop_garden_pts", false],
    ["TeleOp PARK", "teleop_park_pts", false],
    ["TeleOp total", "teleop_pts", true],
    ["Minor fouls", "minor_fouls", false],
    ["Major fouls", "major_fouls", false],
    ["Foul pts given away", "foul_pts_committed", false],
    ["No-penalty total", "pre_foul_total", true],
    ["Final", "total_pts", true],
  ] as const,
} as const;
