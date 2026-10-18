/** Raw per-alliance (or per-team, for remote events) score object from /scores/{event}/{level}. */
// biome-ignore lint/suspicious/noExplicitAny: score shapes differ every season; descriptors read fields by name.
export type ApiScore = Record<string, any>;

/** Season-independent numbers every season provides; these drive OPR, leaderboards and match lists. */
export interface CommonScore {
  auto: number;
  /** End-of-match points (park/ascent/drone…); a subset of driver-controlled points. */
  endgame: number;
  /** No-penalty total: auto + driver-controlled (incl. endgame). */
  np: number;
  /** Official total including penalties. */
  total: number;
  /** Penalty points this alliance gave up (or, in 2020–21, lost from its own score). */
  fouls: number | null;
}

export type ComponentKey = "c1" | "c2" | "c3" | "c4";

export interface Component {
  key: ComponentKey;
  /** Short column header, e.g. "Tips". */
  label: string;
  /** Hover definition. */
  tip: string;
  value: (a: ApiScore) => number;
  /** Format with 2 decimals (counts) instead of 1 (points). */
  count?: boolean;
}

export interface BreakdownRow {
  label: string;
  value: (a: ApiScore) => number | string | null;
  /** Subtotal row: bold. */
  sub?: boolean;
  /** Lower is better (penalties). */
  lower?: boolean;
}

export interface SeasonDescriptor {
  /** Kickoff year, as the v2 API numbers seasons. */
  season: number;
  /** FIRST Championship year (v3 API / avatar files). */
  cmpYear: number;
  game: string;
  program: string;
  /** Kickoff date; week 1 starts on the Monday on/before it. */
  kickoff: string;
  /** Season had remote (single-team) events. */
  hasRemote: boolean;
  common: (a: ApiScore) => CommonScore;
  components: [Component, Component, Component, Component];
  breakdown: BreakdownRow[];
  /** Bonus ranking-point flags shown on the match page. */
  rps?: { label: string; value: (a: ApiScore) => boolean }[];
  /** 2020–21 penalties were deducted from the offender's own score rather than credited to the opponent. */
  penaltiesDeducted?: boolean;
  /**
   * Per-robot box score. One line of counting columns, filled either by a quick tally or by a
   * play-by-play that rolls up into the same columns. Seasons without one don't take scout cards.
   */
  box?: BoxScore;
}

export type BoxGroup = "auto" | "tele" | "end" | "foul";

/** A counting column on the box-score line. Absent (null) means "not recorded", which is not zero. */
export interface BoxColumn {
  key: string;
  /** Short table header (Lv, Tip). */
  label: string;
  /** Full word on the submission form. */
  form: string;
  tip: string;
  group: BoxGroup;
  kind: "bool" | "count";
  /** Points per unit that belong to this robot alone (leave, park). */
  credit?: number;
  max?: number;
  /** Kept on the line and shown in the note under the robot, not as its own column. */
  hidden?: boolean;
  /** Hidden partner column: render "made/attempts" in the note. */
  pair?: string;
  pairLabel?: string;
  /** Hidden count rendered as "note N" in the line under the robot. */
  note?: string;
  /**
   * Split counts (pollen + nectar) that display in this one column.
   * A quick card may instead store a single total under `key`.
   */
  parts?: readonly [string, string];
  partForms?: readonly [string, string];
  /** Official per-robot boolean, robot 1 = station *1. Null when the API didn't say. */
  officialRobot?: (a: ApiScore, robot: 1 | 2) => boolean | null;
  /** Official alliance total. With `officialOnly`, this is the cell in the footer. */
  officialAlliance?: (a: ApiScore) => number | null;
  /**
   * Filled from the official score, never from a scout card. The API publishes one alliance
   * total, so each robot's cell stays blank and the footer shows the scorekeeper's number.
   */
  officialOnly?: boolean;
  /** Flag the cell or the total when scouts and the official scorekeeper disagree. */
  reconcile?: boolean;
}

export interface BoxWhere {
  key: string;
  label: string;
}

/** One click in a play-by-play. Compiles into the counting columns. */
export interface BoxAction {
  key: string;
  label: string;
  period: "auto" | "tele";
  /** Track group. Unchecked groups stay null instead of becoming zero. */
  group: string;
  adds: { column: string; n?: number }[];
  where?: readonly BoxWhere[];
}

export interface BoxQualOption {
  value: string;
  label: string;
  /** Short text under the robot. Omit to record the value but not print it. */
  note?: string;
}

export interface BoxQual {
  key: string;
  label: string;
  kind: "bool" | "enum";
  options?: readonly BoxQualOption[];
  yes?: string;
  no?: string;
}

export interface BoxScore {
  columns: readonly BoxColumn[];
  actions: readonly BoxAction[];
  qual: readonly BoxQual[];
  trackGroups: readonly { key: string; label: string }[];
  noteMax: number;
}

/** Coerce possibly-missing API numbers. */
export const n = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
export const minors = (a: ApiScore) => n(a.minorFouls ?? a.minorPenalties);
export const majors = (a: ApiScore) => n(a.majorFouls ?? a.majorPenalties);
export const count = (v: unknown) => (Array.isArray(v) ? v.length : 0);
