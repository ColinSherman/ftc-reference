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
}

/** Coerce possibly-missing API numbers. */
export const n = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
export const minors = (a: ApiScore) => n(a.minorFouls ?? a.minorPenalties);
export const majors = (a: ApiScore) => n(a.majorFouls ?? a.majorPenalties);
export const count = (v: unknown) => (Array.isArray(v) ? v.length : 0);
