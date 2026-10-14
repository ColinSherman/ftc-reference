import { nowIso, runBatched, upsertStatements } from "@ftcref/db";
import type { ApiAward, FtcApi } from "@ftcref/ftc-api";
import type { Env } from "../env";
import { dataOf, trackedGet } from "../tracked";

export async function syncAwards(env: Env, api: FtcApi, season: number, code: string, force = false) {
  const t = await trackedGet<{ awards: ApiAward[] }>(env, api, season, `awards/${code}`, force);
  const now = nowIso();
  const rows = (dataOf(t)?.awards ?? []).map((a) => ({
    season,
    event_code: code,
    award_id: a.awardId,
    series: a.series ?? 0,
    team: a.teamNumber ?? 0,
    name: a.name,
    person_name: a.person,
    updated_at: now,
  }));
  await runBatched(env.DB, [
    ...upsertStatements(env.DB, "awards", rows, ["season", "event_code", "award_id", "series", "team"]),
    t.commit(),
  ]);
  return rows.length;
}
