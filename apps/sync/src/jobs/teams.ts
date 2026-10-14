import { nowIso, runBatched, upsertStatements } from "@ftcref/db";
import type { ApiTeam, ApiTeamsPage, FtcApi } from "@ftcref/ftc-api";
import type { Env } from "../env";
import { dataOf, trackedGet } from "../tracked";

export function teamRows(season: number, teams: ApiTeam[]) {
  const now = nowIso();
  return {
    teams: teams.map((t) => ({
      number: t.teamNumber,
      name_short: t.nameShort,
      name_full: t.nameFull,
      school: t.schoolName,
      city: t.city,
      state_prov: t.stateProv,
      country: t.country,
      rookie_year: t.rookieYear,
      website: t.website,
      home_region: t.homeRegion,
      updated_at: now,
    })),
    seasons: teams.map((t) => ({
      season,
      number: t.teamNumber,
      robot_name: t.robotName,
      region_code: t.homeRegion,
      league_code: null,
      display_location: t.displayLocation,
      updated_at: now,
    })),
  };
}

/** One page of the global team list; returns the total page count so the caller can fan out. */
export async function syncTeamsPage(env: Env, api: FtcApi, season: number, page: number) {
  const t = await trackedGet<ApiTeamsPage>(env, api, season, `teams?page=${page}`);
  const data = dataOf(t);
  const { teams, seasons } = teamRows(season, data?.teams ?? []);
  const stmts = [
    ...upsertStatements(env.DB, "teams", teams, ["number"]),
    ...upsertStatements(env.DB, "team_seasons", seasons, ["season", "number"]),
    t.commit(),
  ];
  await runBatched(env.DB, stmts);
  return { written: teams.length, pageTotal: data?.pageTotal ?? null };
}
