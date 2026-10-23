import { runBatched, upsertStatements } from "@ftcref/db";
import type { ApiTeamsPage, FtcApi } from "@ftcref/ftc-api";
import type { Env } from "../env";
import { changed, dataOf, trackedGet } from "../tracked";
import { teamStatements } from "./teams";

/**
 * Registered-team list for one event. Rosters fill in (and change) for weeks before an event, long
 * before any schedule exists, so this runs on its own instead of riding along with `eventMatches`.
 * The list is replaced, not merged: a team that withdraws drops off. A 304 costs one cheap request.
 */
export async function syncEventTeams(env: Env, api: FtcApi, season: number, code: string, force = false) {
  const t = await trackedGet<ApiTeamsPage>(env, api, season, `teams?eventCode=${code}`, force);
  if (!changed(t)) {
    await env.DB.batch([t.commit()]);
    return 0;
  }
  const teams = dataOf(t)?.teams ?? [];
  const nums = teams.map((x) => x.teamNumber);
  await runBatched(env.DB, [
    ...teamStatements(env.DB, season, teams),
    ...upsertStatements(
      env.DB,
      "event_teams",
      nums.map((team) => ({ season, event_code: code, team })),
      ["season", "event_code", "team"],
    ),
    env.DB.prepare(
      `DELETE FROM event_teams WHERE season = ? AND event_code = ?
         AND team NOT IN (SELECT value FROM json_each(?))`,
    ).bind(season, code, JSON.stringify(nums)),
    t.commit(),
  ]);
  // Event pages are cached by version key; bump it so the new roster shows without waiting for the TTL.
  await env.CACHE_VER.put(`event:${season}:${code}`, Date.now().toString(36));
  return nums.length;
}
