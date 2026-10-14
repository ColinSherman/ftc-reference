import { bool, nowIso, runBatched, upsertStatements } from "@ftcref/db";
import type {
  ApiAlliance,
  ApiAlliance2026,
  ApiHybridMatch,
  ApiMatchScores,
  ApiRanking,
  ApiTeamsPage,
  FtcApi,
  TournamentLevel,
} from "@ftcref/ftc-api";
import { mapAlliance2026 } from "@ftcref/seasons";
import type { Env } from "../env";
import { changed, dataOf, type Tracked, trackedGet } from "../tracked";
import { recomputeEventStats } from "./eventStats";
import { teamRows } from "./teams";

const LEVEL: Record<TournamentLevel, string> = {
  QUALIFICATION: "Q",
  PLAYOFF: "P",
  SEMIFINAL: "SF",
  FINAL: "F",
  OTHER: "O",
};

const matchKey = (level: string, series: number, num: number) => `${level}|${series}|${num}`;

/**
 * Sync one event's schedule, results, score details, rankings, team list and alliances.
 * Cheap path: if both hybrid schedules return 304, nothing else is fetched.
 */
export async function syncEventMatches(env: Env, api: FtcApi, season: number, code: string, force = false) {
  const qualH = await trackedGet<{ schedule: ApiHybridMatch[] }>(
    env,
    api,
    season,
    `schedule/${code}/qual/hybrid`,
    force,
  );
  const playH = await trackedGet<{ schedule: ApiHybridMatch[] }>(
    env,
    api,
    season,
    `schedule/${code}/playoff/hybrid`,
    force,
  );
  if (!changed(qualH) && !changed(playH)) {
    await env.DB.batch([qualH.commit(), playH.commit()]);
    return { changed: false, rows: 0 };
  }

  const [qualS, playS, ranks, teams, allys] = await Promise.all([
    trackedGet<{ matchScores: ApiMatchScores<ApiAlliance2026>[] }>(
      env,
      api,
      season,
      `scores/${code}/qual`,
      force,
    ),
    trackedGet<{ matchScores: ApiMatchScores<ApiAlliance2026>[] }>(
      env,
      api,
      season,
      `scores/${code}/playoff`,
      force,
    ),
    trackedGet<{ rankings: ApiRanking[] }>(env, api, season, `rankings/${code}`, force),
    trackedGet<ApiTeamsPage>(env, api, season, `teams?eventCode=${code}`, force),
    trackedGet<{ alliances: ApiAlliance[] }>(env, api, season, `alliances/${code}`, force),
  ]);
  const commits = [qualH, playH, qualS, playS, ranks, teams, allys].map((t: Tracked<unknown>) => t.commit());
  const now = nowIso();
  let rows = 0;

  // --- matches -------------------------------------------------------------
  // A 304 on one schedule only means that half is unchanged; we re-upsert whatever we received.
  const hybrid = [...(dataOf(qualH)?.schedule ?? []), ...(dataOf(playH)?.schedule ?? [])];
  const scores = [...(dataOf(qualS)?.matchScores ?? []), ...(dataOf(playS)?.matchScores ?? [])];

  const matchRows = hybrid.map((m) => {
    const level = LEVEL[m.tournamentLevel];
    const played = m.postResultTime != null || m.scoreRedFinal != null;
    return {
      season,
      event_code: code,
      level,
      series: m.series ?? 0,
      match_number: m.matchNumber,
      description: m.description,
      field: m.field ? Number(m.field) || null : null,
      scheduled_at: m.startTime,
      actual_start_at: m.actualStartTime,
      post_result_at: m.postResultTime,
      red_score: m.scoreRedFinal,
      blue_score: m.scoreBlueFinal,
      red_auto: m.scoreRedAuto,
      blue_auto: m.scoreBlueAuto,
      red_foul: m.scoreRedFoul,
      blue_foul: m.scoreBlueFoul,
      winner: !played ? null : m.redWins ? "R" : m.blueWins ? "B" : "T",
      played: bool(played),
      updated_at: now,
    };
  });
  await runBatched(
    env.DB,
    upsertStatements(env.DB, "matches", matchRows, [
      "season",
      "event_code",
      "level",
      "series",
      "match_number",
    ]),
  );
  rows += matchRows.length;

  const ids = await env.DB.prepare(
    "SELECT id, level, series, match_number FROM matches WHERE season = ? AND event_code = ?",
  )
    .bind(season, code)
    .all<{ id: number; level: string; series: number; match_number: number }>();
  const idByKey = new Map(ids.results.map((r) => [matchKey(r.level, r.series, r.match_number), r.id]));

  const teamStmts: D1PreparedStatement[] = [];
  const scoreRows: Record<string, string | number | null>[] = [];
  for (const m of hybrid) {
    const level = LEVEL[m.tournamentLevel];
    const id = idByKey.get(matchKey(level, m.series ?? 0, m.matchNumber));
    if (id == null) continue;
    const mt = m.teams
      .filter((t) => t.teamNumber != null)
      .map((t) => ({
        match_id: id,
        station: t.station,
        alliance: t.station.startsWith("Red") ? "R" : "B",
        team: t.teamNumber as number,
        surrogate: bool(t.surrogate),
        no_show: bool(t.noShow),
        dq: bool(t.dq),
        on_field: bool(t.onField),
      }));
    teamStmts.push(...upsertStatements(env.DB, "match_teams", mt, ["match_id", "station"]));
  }
  // Keyed off the DB ids (not `hybrid`) so score updates land even when the schedule itself was a 304.
  for (const s of scores) {
    const id = idByKey.get(matchKey(LEVEL[s.matchLevel], s.matchSeries ?? 0, s.matchNumber));
    if (id == null) continue;
    for (const a of s.alliances) scoreRows.push({ match_id: id, ...mapAlliance2026(a), updated_at: now });
  }

  // --- rankings / teams / alliances -----------------------------------------
  const rankRows = (dataOf(ranks)?.rankings ?? []).map((r) => ({
    season,
    event_code: code,
    team: r.teamNumber,
    rank: r.rank,
    ranking_score: r.sortOrder1,
    sort1: r.sortOrder1,
    sort2: r.sortOrder2,
    sort3: r.sortOrder3,
    sort4: r.sortOrder4,
    sort5: r.sortOrder5,
    sort6: r.sortOrder6,
    wins: r.wins,
    losses: r.losses,
    ties: r.ties,
    played: r.matchesPlayed,
    dq_count: r.dq,
    updated_at: now,
  }));
  const eventTeams = dataOf(teams)?.teams ?? [];
  const tr = teamRows(season, eventTeams);
  const allyRows = (dataOf(allys)?.alliances ?? []).map((a) => ({
    season,
    event_code: code,
    number: a.number,
    name: a.name,
    captain: teamNum(a.captain),
    pick1: teamNum(a.round1),
    pick2: teamNum(a.round2),
    backup: teamNum(a.backup),
    updated_at: now,
  }));

  await runBatched(env.DB, [
    ...teamStmts,
    ...upsertStatements(env.DB, "s2026_match_scores", scoreRows, ["match_id", "alliance"]),
    // Denormalize no-penalty totals onto matches (kept out of the match upsert so a 304 on scores can't null them).
    env.DB.prepare(
      `UPDATE matches SET
         red_np  = (SELECT pre_foul_total FROM s2026_match_scores s WHERE s.match_id = matches.id AND s.alliance = 'R'),
         blue_np = (SELECT pre_foul_total FROM s2026_match_scores s WHERE s.match_id = matches.id AND s.alliance = 'B')
       WHERE season = ? AND event_code = ?`,
    ).bind(season, code),
    ...upsertStatements(env.DB, "teams", tr.teams, ["number"]),
    ...upsertStatements(
      env.DB,
      "event_teams",
      eventTeams.map((t) => ({ season, event_code: code, team: t.teamNumber })),
      ["season", "event_code", "team"],
    ),
  ]);
  rows += scoreRows.length + eventTeams.length;
  // Rankings and alliances are written separately: a shape surprise in either must not
  // roll back the matches, teams and scores above.
  rows += await bestEffort(code, "rankings", () =>
    runBatched(env.DB, upsertStatements(env.DB, "rankings", rankRows, ["season", "event_code", "team"])).then(
      () => rankRows.length,
    ),
  );
  rows += await bestEffort(code, "alliances", () =>
    runBatched(
      env.DB,
      upsertStatements(env.DB, "alliances", allyRows, ["season", "event_code", "number"]),
    ).then(() => allyRows.length),
  );

  rows += await recomputeEventStats(env.DB, season, code);
  // Only now is it safe to remember Last-Modified values.
  await env.DB.batch(commits);
  await bumpVersion(env, `event:${season}:${code}`);
  return { changed: true, rows };
}

/** Team numbers sometimes arrive wrapped in an object; accept either shape. */
export function teamNum(v: unknown): number | null {
  if (typeof v === "number") return v;
  if (typeof v === "string" && /^\d+$/.test(v)) return Number(v);
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    for (const k of ["teamNumber", "team", "number"]) if (typeof o[k] === "number") return o[k] as number;
    console.warn("unrecognised team value", JSON.stringify(v).slice(0, 300));
  }
  return null;
}

async function bestEffort(code: string, what: string, fn: () => Promise<number>): Promise<number> {
  try {
    return await fn();
  } catch (e) {
    console.error(`${code}: ${what} write failed`, e);
    return 0;
  }
}

export async function bumpVersion(env: Env, key: string) {
  await env.CACHE_VER.put(key, Date.now().toString(36));
}
