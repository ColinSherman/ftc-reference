import { nowIso, runBatched, upsertStatements } from "@ftcref/db";
import type { ApiLeague, FtcApi } from "@ftcref/ftc-api";
import type { Env } from "../env";
import { dataOf, trackedGet } from "../tracked";

export async function syncLeagues(env: Env, api: FtcApi, season: number) {
  const t = await trackedGet<{ leagues: ApiLeague[] }>(env, api, season, "leagues");
  const leagues = dataOf(t)?.leagues ?? [];
  const now = nowIso();
  const rows = leagues.map((l) => ({
    season,
    region: l.region,
    code: l.code,
    name: l.name,
    parent_league: l.parentLeagueCode,
    updated_at: now,
  }));
  await runBatched(env.DB, [
    ...upsertStatements(env.DB, "leagues", rows, ["season", "region", "code"]),
    t.commit(),
  ]);
  return leagues.map((l) => ({ region: l.region, code: l.code }));
}

export async function syncLeagueMembers(env: Env, api: FtcApi, season: number, region: string, code: string) {
  const t = await trackedGet<{ members: number[] }>(env, api, season, `leagues/members/${region}/${code}`);
  if (t.result.status === "not_modified") {
    await t.commit().run();
    return 0;
  }
  const rows = (dataOf(t)?.members ?? []).map((team) => ({ season, region, league: code, team }));
  await runBatched(env.DB, [
    env.DB.prepare("DELETE FROM league_members WHERE season = ? AND region = ? AND league = ?").bind(
      season,
      region,
      code,
    ),
    ...upsertStatements(env.DB, "league_members", rows, ["season", "region", "league", "team"]),
    ...rows.map((r) =>
      env.DB.prepare("UPDATE team_seasons SET league_code = ? WHERE season = ? AND number = ?").bind(
        code,
        season,
        r.team,
      ),
    ),
    t.commit(),
  ]);
  return rows.length;
}
