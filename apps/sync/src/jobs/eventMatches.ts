import { bool, nowIso, type Row, runBatched, upsertStatements } from "@ftcref/db";
import type {
  ApiAlliance,
  ApiHybridMatch,
  ApiRanking,
  ApiTeamsPage,
  FtcApi,
  TournamentLevel,
} from "@ftcref/ftc-api";
import { type ApiScore, correctionFor, getSeason, scoreColumns } from "@ftcref/seasons";
import type { Env } from "../env";
import { changed, dataOf, type Tracked, trackedGet } from "../tracked";
import { recomputeEventStats } from "./eventStats";
import { teamStatements } from "./teams";

const LEVEL: Record<TournamentLevel, string> = {
  QUALIFICATION: "Q",
  PLAYOFF: "P",
  SEMIFINAL: "SF",
  FINAL: "F",
  OTHER: "O",
};

/** /scores payloads: traditional events have two alliances; remote events score one team per match. */
type TradScore = {
  matchLevel: TournamentLevel;
  matchSeries: number;
  matchNumber: number;
  alliances: ApiScore[];
};
type RemoteScore = { matchLevel: TournamentLevel; matchNumber: number; teamNumber: number; scores: ApiScore };
type AnyScore = TradScore | RemoteScore;

/** Secondary endpoints: an API error there must not lose the event's schedule. */
const SOFT = { soft: true };

const matchKey = (level: string, series: number, num: number) => `${level}|${series}|${num}`;

/**
 * Sync one event's schedule, results, score details, rankings, team list and alliances, for any season.
 * Cheap path: if both hybrid schedules return 304, nothing else is fetched.
 *
 * Remote events (2020–21) have one team per match and every team plays "Q1", "Q2"…; we store the team
 * number in `series` so (level, series, match_number) stays unique.
 */
export async function syncEventMatches(env: Env, api: FtcApi, season: number, code: string, force = false) {
  const desc = getSeason(season);
  const ev = await env.DB.prepare("SELECT remote FROM events WHERE season = ? AND code = ?")
    .bind(season, code)
    .first<{ remote: number }>();
  const remote = !!ev?.remote;

  const qualH = await trackedGet<{ schedule: ApiHybridMatch[] }>(
    env,
    api,
    season,
    `schedule/${code}/qual/hybrid`,
    force,
  );
  const playH = remote
    ? null
    : await trackedGet<{ schedule: ApiHybridMatch[] }>(
        env,
        api,
        season,
        `schedule/${code}/playoff/hybrid`,
        force,
        SOFT,
      );
  if (!changed(qualH) && (!playH || !changed(playH))) {
    await env.DB.batch([qualH.commit(), ...(playH ? [playH.commit()] : [])]);
    return { changed: false, rows: 0 };
  }

  const [qualS, playS, ranks, teams, allys] = await Promise.all([
    trackedGet<{ matchScores: AnyScore[] }>(env, api, season, `scores/${code}/qual`, force, SOFT),
    remote
      ? null
      : trackedGet<{ matchScores: AnyScore[] }>(env, api, season, `scores/${code}/playoff`, force, SOFT),
    trackedGet<{ rankings: ApiRanking[] }>(env, api, season, `rankings/${code}`, force, SOFT),
    trackedGet<ApiTeamsPage>(env, api, season, `teams?eventCode=${code}`, force, SOFT),
    remote
      ? null
      : trackedGet<{ alliances: ApiAlliance[] }>(env, api, season, `alliances/${code}`, force, SOFT),
  ]);
  const tracked: Tracked<unknown>[] = [];
  for (const t of [qualH, playH, qualS, playS, ranks, teams, allys])
    if (t) tracked.push(t as Tracked<unknown>);
  const now = nowIso();
  let rows = 0;

  // --- matches -------------------------------------------------------------
  const hybrid = [...(dataOf(qualH)?.schedule ?? []), ...(playH ? (dataOf(playH)?.schedule ?? []) : [])];
  const seriesOf = (m: ApiHybridMatch) => (remote ? (m.teams[0]?.teamNumber ?? 0) : (m.series ?? 0));

  const matchRows = hybrid.map((m) => {
    const played = m.postResultTime != null || m.scoreRedFinal != null;
    return {
      season,
      event_code: code,
      level: LEVEL[m.tournamentLevel] ?? "O",
      series: seriesOf(m),
      match_number: m.matchNumber,
      description: m.description,
      field: m.field ? Number(m.field) || null : null,
      scheduled_at: m.startTime,
      actual_start_at: m.actualStartTime,
      post_result_at: m.postResultTime,
      red_score: m.scoreRedFinal,
      blue_score: remote ? null : m.scoreBlueFinal,
      red_auto: m.scoreRedAuto,
      blue_auto: remote ? null : m.scoreBlueAuto,
      red_foul: m.scoreRedFoul,
      blue_foul: remote ? null : m.scoreBlueFoul,
      winner: !played || remote ? null : m.redWins ? "R" : m.blueWins ? "B" : "T",
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
  for (const m of hybrid) {
    const id = idByKey.get(matchKey(LEVEL[m.tournamentLevel] ?? "O", seriesOf(m), m.matchNumber));
    if (id == null) continue;
    const mt = m.teams
      .filter((t) => t.teamNumber != null)
      .map((t) => ({
        match_id: id,
        station: t.station,
        alliance: remote || t.station.startsWith("Red") ? "R" : "B",
        team: t.teamNumber as number,
        surrogate: bool(t.surrogate),
        no_show: bool(t.noShow),
        dq: bool(t.dq),
        on_field: bool(t.onField),
      }));
    teamStmts.push(...upsertStatements(env.DB, "match_teams", mt, ["match_id", "station"]));
  }

  // --- scores (keyed off DB ids so updates land even when the schedule itself was a 304) -------------
  const scores = [
    ...(dataOf(qualS)?.matchScores ?? []),
    ...(playS ? (dataOf(playS)?.matchScores ?? []) : []),
  ];
  const scoreRows: Row[] = [];
  const correction = correctionFor(season, code);
  const toRow = (id: number, alliance: string, reported: ApiScore) => {
    const fixed = correction?.apply(reported) ?? null;
    const a = fixed ?? reported;
    return {
      match_id: id,
      alliance,
      season,
      ...scoreColumns(desc, a),
      detail: JSON.stringify(a),
      adjusted: bool(fixed != null),
      updated_at: now,
    };
  };
  for (const s of scores) {
    const level = LEVEL[s.matchLevel] ?? "O";
    if ("scores" in s) {
      const id = idByKey.get(matchKey(level, s.teamNumber, s.matchNumber));
      if (id != null && s.scores) scoreRows.push(toRow(id, "R", s.scores));
    } else {
      const id = idByKey.get(matchKey(level, s.matchSeries ?? 0, s.matchNumber));
      if (id == null) continue;
      for (const a of s.alliances ?? []) scoreRows.push(toRow(id, a.alliance === "Blue" ? "B" : "R", a));
    }
  }

  const eventTeams = dataOf(teams)?.teams ?? [];
  await runBatched(env.DB, [
    ...teamStmts,
    // Each score row carries ~1–3 KB of JSON; one row per statement keeps statements small.
    ...scoreRows.flatMap((r) => upsertStatements(env.DB, "match_scores", [r], ["match_id", "alliance"])),
    // Denormalise no-penalty totals onto matches (kept out of the match upsert so a 304 on scores can't null them).
    // Only rows whose totals moved are rewritten (D1 bills every rewritten row).
    env.DB.prepare(
      `UPDATE matches SET red_np = n.r, blue_np = n.b
       FROM (SELECT m.id,
                    (SELECT np FROM match_scores s WHERE s.match_id = m.id AND s.alliance = 'R') AS r,
                    (SELECT np FROM match_scores s WHERE s.match_id = m.id AND s.alliance = 'B') AS b
             FROM matches m WHERE m.season = ?1 AND m.event_code = ?2) AS n
       WHERE matches.id = n.id AND (matches.red_np IS NOT n.r OR matches.blue_np IS NOT n.b)`,
    ).bind(season, code),
    // Corrected scores replace the reported finals too. Winners stay as officially recorded.
    ...(correction
      ? [
          env.DB.prepare(
            `UPDATE matches SET
               red_score  = COALESCE((SELECT total FROM match_scores s WHERE s.match_id = matches.id AND s.alliance = 'R' AND s.adjusted = 1), red_score),
               blue_score = COALESCE((SELECT total FROM match_scores s WHERE s.match_id = matches.id AND s.alliance = 'B' AND s.adjusted = 1), blue_score)
             WHERE season = ? AND event_code = ?`,
          ).bind(season, code),
        ]
      : []),
    ...teamStatements(env.DB, season, eventTeams),
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
  rows += await bestEffort(code, "rankings", () =>
    runBatched(env.DB, upsertStatements(env.DB, "rankings", rankRows, ["season", "event_code", "team"])).then(
      () => rankRows.length,
    ),
  );
  const allyRows = (allys ? (dataOf(allys)?.alliances ?? []) : []).map((a) => ({
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
  rows += await bestEffort(code, "alliances", () =>
    runBatched(
      env.DB,
      upsertStatements(env.DB, "alliances", allyRows, ["season", "event_code", "number"]),
    ).then(() => allyRows.length),
  );

  rows += await recomputeEventStats(env.DB, season, code, remote);
  // Only now is it safe to remember Last-Modified values.
  await env.DB.batch(tracked.map((t) => t.commit()));
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
