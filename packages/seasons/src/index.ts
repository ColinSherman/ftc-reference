import { SEASONS } from "./descriptors";
import type { ApiScore, SeasonDescriptor } from "./types";

export * from "./box";
export { SEASONS } from "./descriptors";
export * from "./types";

export const CURRENT_SEASON = 2026;
/** Newest first — the order seasons are listed and backfilled in. */
export const ALL_SEASONS = Object.keys(SEASONS)
  .map(Number)
  .sort((a, b) => b - a);

export function getSeason(season: number): SeasonDescriptor {
  const d = SEASONS[season];
  if (!d) throw new Error(`unknown season ${season}`);
  return d;
}

export const isSeason = (season: number) => season in SEASONS;

/** "2026–27" */
export const seasonLabel = (season: number) => `${season}–${String(season + 1).slice(2)}`;

/** Flatten one API score object into the generic match_scores columns. */
export function scoreColumns(d: SeasonDescriptor, a: ApiScore) {
  const c = d.common(a);
  const [c1, c2, c3, c4] = d.components.map((k) => k.value(a));
  return {
    auto: c.auto,
    teleop: c.np - c.auto,
    endgame: c.endgame,
    np: c.np,
    total: c.total,
    fouls: c.fouls,
    c1: c1 ?? 0,
    c2: c2 ?? 0,
    c3: c3 ?? 0,
    c4: c4 ?? 0,
  };
}

/** Monday on or before kickoff: week 1 of the season. */
export function firstMonday(d: SeasonDescriptor): Date {
  const k = new Date(`${d.kickoff}T00:00:00Z`);
  const back = (k.getUTCDay() + 6) % 7;
  return new Date(k.getTime() - back * 86_400_000);
}

/** 1-based week number of an event-local date (YYYY-MM-DD…) relative to kickoff. */
export function weekOf(d: SeasonDescriptor, date: string): number {
  const t = Date.parse(`${date.slice(0, 10)}T00:00:00Z`);
  return Math.floor((t - firstMonday(d).getTime()) / (7 * 86_400_000)) + 1;
}
