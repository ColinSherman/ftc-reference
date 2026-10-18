import { getCookie } from "hono/cookie";
import type { AppContext } from "./env";

/** `all` includes off-season. The default also counts non-advancement (scrimmages). */
export type StatsMode = "official" | "all";

export function statsMode(c: AppContext): StatsMode {
  return getCookie(c, "stats") === "all" ? "all" : "official";
}

export function seasonStatsTable(mode: StatsMode): "team_season_stats" | "team_official_stats" {
  return mode === "all" ? "team_season_stats" : "team_official_stats";
}
