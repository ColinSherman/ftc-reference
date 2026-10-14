import { nowIso, runBatched, upsertStatements } from "@ftcref/db";
import type { ApiTeam, ApiTeamsPage, FtcApi } from "@ftcref/ftc-api";
import { CURRENT_SEASON } from "@ftcref/seasons";
import type { Env } from "../env";
import { dataOf, trackedGet } from "../tracked";

/**
 * Upserts for a list of API teams. `teams` holds current info, so older seasons only insert teams we
 * have never seen (never overwrite today's name with a 2019 one); per-season facts go to team_seasons.
 * league_code is owned by the leagues job and deliberately not written here.
 */
export function teamStatements(db: D1Database, season: number, teams: ApiTeam[]) {
  const now = nowIso();
  const rows = teams.map((t) => ({
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
  }));
  const seasons = teams.map((t) => ({
    season,
    number: t.teamNumber,
    name_short: t.nameShort,
    robot_name: t.robotName,
    region_code: t.homeRegion,
    display_location: t.displayLocation,
    updated_at: now,
  }));
  return [
    ...upsertStatements(db, "teams", rows, ["number"], { ignoreExisting: season !== CURRENT_SEASON }),
    ...upsertStatements(db, "team_seasons", seasons, ["season", "number"]),
  ];
}

/** One page of the global team list; returns the total page count so the caller can fan out. */
export async function syncTeamsPage(env: Env, api: FtcApi, season: number, page: number, force = false) {
  const t = await trackedGet<ApiTeamsPage>(env, api, season, `teams?page=${page}`, force);
  const data = dataOf(t);
  const teams = data?.teams ?? [];
  await runBatched(env.DB, [...teamStatements(env.DB, season, teams), t.commit()]);
  return { written: teams.length, pageTotal: data?.pageTotal ?? null };
}
