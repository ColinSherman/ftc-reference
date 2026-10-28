import { nowIso, runBatched, upsertStatements } from "@ftcref/db";
import { seasonKindIn } from "@ftcref/seasons";
import { type AllianceObs, computeOpr, mean, stddev } from "@ftcref/stats";

interface ScoreJoin {
  match_id: number;
  alliance: string;
  winner: string | null;
  level: string;
  np: number;
  total: number;
  auto: number;
  teleop: number;
  endgame: number;
  fouls: number | null;
  c1: number;
  c2: number;
  c3: number;
  c4: number;
}

/** OPR targets, in order: the generic columns every season has. */
const TARGETS = ["np", "total", "auto", "teleop", "endgame", "c1", "c2", "c3", "c4", "fouls"] as const;

/**
 * Recompute team_event_stats for one event, then the season rollup for its teams. Uses qualification
 * matches when there are any (playoff alliances are not random), otherwise everything played.
 * Remote events have one team per "alliance", so OPR there is simply the team's average.
 */
export async function recomputeEventStats(db: D1Database, season: number, code: string, remote = false) {
  const [scoresRes, teamsRes, ranksRes] = await db.batch([
    db
      .prepare(
        `SELECT s.match_id, s.alliance, m.winner, m.level, s.np, s.total, s.auto, s.teleop, s.endgame, s.fouls,
                s.c1, s.c2, s.c3, s.c4
         FROM matches m JOIN match_scores s ON s.match_id = m.id
         WHERE m.season = ? AND m.event_code = ? AND m.played = 1`,
      )
      .bind(season, code),
    db
      .prepare(
        `SELECT mt.match_id, mt.alliance, mt.team, mt.surrogate, m.level FROM match_teams mt
         JOIN matches m ON m.id = mt.match_id
         WHERE m.season = ? AND m.event_code = ? AND m.played = 1`,
      )
      .bind(season, code),
    db.prepare("SELECT team, rank FROM rankings WHERE season = ? AND event_code = ?").bind(season, code),
  ]);
  const allScores = (scoresRes?.results ?? []) as ScoreJoin[];
  const allTeams = (teamsRes?.results ?? []) as {
    match_id: number;
    alliance: string;
    team: number;
    surrogate: number;
    level: string;
  }[];
  const hasQuals = allScores.some((s) => s.level === "Q");
  const scores = hasQuals ? allScores.filter((s) => s.level === "Q") : allScores;
  const mteams = hasQuals ? allTeams.filter((t) => t.level === "Q") : allTeams;
  const rankOf = new Map(
    ((ranksRes?.results ?? []) as { team: number; rank: number }[]).map((r) => [r.team, r.rank]),
  );
  if (scores.length === 0) return 0;

  const byAlliance = new Map(scores.map((s) => [`${s.match_id}|${s.alliance}`, s]));
  const teamsByAlliance = new Map<string, typeof mteams>();
  for (const t of mteams) {
    const k = `${t.match_id}|${t.alliance}`;
    teamsByAlliance.set(k, [...(teamsByAlliance.get(k) ?? []), t]);
  }

  const obs: AllianceObs[] = [];
  const per = new Map<
    number,
    { np: number[]; auto: number[]; teleop: number[]; w: number; l: number; t: number }
  >();
  for (const s of scores) {
    const teams = teamsByAlliance.get(`${s.match_id}|${s.alliance}`) ?? [];
    if (teams.length === 0) continue;
    const opp = remote ? undefined : byAlliance.get(`${s.match_id}|${s.alliance === "R" ? "B" : "R"}`);
    obs.push({
      teams: teams.map((t) => t.team),
      values: [...TARGETS.map((k) => Number(s[k] ?? 0)), opp?.np ?? 0],
    });
    for (const t of teams) {
      if (t.surrogate) continue;
      const p = per.get(t.team) ?? { np: [], auto: [], teleop: [], w: 0, l: 0, t: 0 };
      p.np.push(s.np);
      p.auto.push(s.auto);
      p.teleop.push(s.teleop);
      if (!remote) {
        if (s.winner === s.alliance) p.w++;
        else if (s.winner === "T") p.t++;
        else if (s.winner) p.l++;
      }
      per.set(t.team, p);
    }
  }

  const opr = computeOpr(obs, TARGETS.length + 1);
  const now = nowIso();
  const r2 = (x: number | undefined) => (x == null ? null : Math.round(x * 100) / 100);
  const rows = [...per].map(([team, p]) => {
    const o = opr.get(team) ?? [];
    const at = (k: (typeof TARGETS)[number]) => r2(o[TARGETS.indexOf(k)]);
    const dpr = remote ? null : r2(o[TARGETS.length]);
    const np = at("np");
    return {
      season,
      event_code: code,
      team,
      played: p.np.length,
      wins: p.w,
      losses: p.l,
      ties: p.t,
      rank: rankOf.get(team) ?? null,
      opr_np: np,
      opr_total: at("total"),
      opr_auto: at("auto"),
      opr_teleop: at("teleop"),
      opr_endgame: at("endgame"),
      opr_c1: at("c1"),
      opr_c2: at("c2"),
      opr_c3: at("c3"),
      opr_c4: at("c4"),
      opr_fouls: at("fouls"),
      dpr,
      ccwm: np != null && dpr != null ? r2(np - dpr) : null,
      avg_np: r2(mean(p.np)),
      avg_auto: r2(mean(p.auto)),
      avg_teleop: r2(mean(p.teleop)),
      max_np: Math.max(...p.np),
      min_np: Math.min(...p.np),
      std_np: r2(stddev(p.np)),
      updated_at: now,
    };
  });

  await runBatched(db, upsertStatements(db, "team_event_stats", rows, ["season", "event_code", "team"]));
  await recomputeSeasonStats(db, season, [...per.keys()]);
  return rows.length;
}

type SeasonStatsTable = "team_season_stats" | "team_official_stats";

/**
 * Store each team's world rank (by best NP OPR), the season's ranked-team counts, and its event,
 * team and played-match counts, so team pages and season lists don't count them per view. Only
 * values that moved are written.
 */
export async function refreshSeasonRanks(db: D1Database, season: number) {
  const rank = (table: SeasonStatsTable) =>
    db
      .prepare(
        `UPDATE ${table} AS t SET world_rank = r.rk
         FROM (SELECT team, CASE WHEN best_opr_np IS NULL THEN NULL
                                 ELSE RANK() OVER (ORDER BY best_opr_np DESC) END AS rk
               FROM ${table} WHERE season = ?1) AS r
         WHERE t.season = ?1 AND t.team = r.team AND t.world_rank IS NOT r.rk`,
      )
      .bind(season);
  await db.batch([
    rank("team_season_stats"),
    rank("team_official_stats"),
    db
      .prepare(
        `UPDATE seasons SET ranked_all = c.a, ranked_official = c.o,
                            event_count = c.e, team_count = c.t, played_count = c.p
         FROM (SELECT (SELECT COUNT(*) FROM team_season_stats WHERE season = ?1) AS a,
                      (SELECT COUNT(*) FROM team_official_stats WHERE season = ?1) AS o,
                      (SELECT COUNT(*) FROM events WHERE season = ?1) AS e,
                      (SELECT COUNT(*) FROM team_seasons WHERE season = ?1) AS t,
                      (SELECT COALESCE(SUM(played_count), 0) FROM events WHERE season = ?1) AS p) AS c
         WHERE year = ?1 AND (ranked_all IS NOT c.a OR ranked_official IS NOT c.o OR event_count IS NOT c.e
                              OR team_count IS NOT c.t OR played_count IS NOT c.p)`,
      )
      .bind(season),
  ]);
}

/**
 * Season rollup per team: best / latest event OPRs and best single-match NP.
 * Writes every event into team_season_stats, and season events (official plus non-advancement)
 * into team_official_stats. Off-season stays in the all-events table only.
 * Both tables come from one read per chunk: this runs after every change at a live event.
 */
export async function recomputeSeasonStats(db: D1Database, season: number, teams: number[]) {
  const now = nowIso();
  for (let i = 0; i < teams.length; i += 90) {
    const chunk = teams.slice(i, i + 90);
    const ph = chunk.map(() => "?").join(",");
    // INDEXED BY / CROSS JOIN: without them SQLite walks the whole season (the primary key's
    // first column) instead of these teams' rows.
    const [evRes, bestRes] = await db.batch([
      db
        .prepare(
          `SELECT t.*, e.date_end, ${seasonKindIn("e")} AS official
           FROM team_event_stats t INDEXED BY tes_by_team
           CROSS JOIN events e ON e.season = t.season AND e.code = t.event_code
           WHERE t.season = ? AND t.team IN (${ph})`,
        )
        .bind(season, ...chunk),
      // Best match per team, separately for season events and the rest (bare match_id follows MAX).
      db
        .prepare(
          `SELECT mt.team, ${seasonKindIn("e")} AS official, s.match_id, MAX(s.np) AS best_np
           FROM match_teams mt INDEXED BY match_teams_by_team
           CROSS JOIN matches m ON m.id = mt.match_id AND m.season = ?
           CROSS JOIN events e ON e.season = m.season AND e.code = m.event_code
           CROSS JOIN match_scores s ON s.match_id = mt.match_id AND s.alliance = mt.alliance
           WHERE mt.team IN (${ph}) AND mt.surrogate = 0
           GROUP BY mt.team, official`,
        )
        .bind(season, ...chunk),
    ]);
    const evs = (evRes?.results ?? []) as Ev[];
    const best = (bestRes?.results ?? []) as Best[];
    const all = rollupRows(season, chunk, evs, best, now);
    const official = rollupRows(
      season,
      chunk,
      evs.filter((e) => e.official),
      best.filter((b) => b.official),
      now,
    );
    // A team with no season events left (say, an event reclassified as off-season) drops out.
    const drop = chunk.filter((team) => !official.some((r) => r.team === team));
    await runBatched(db, [
      ...upsertStatements(db, "team_season_stats", all, ["season", "team"]),
      ...(drop.length > 0
        ? [
            db
              .prepare(
                `DELETE FROM team_official_stats WHERE season = ? AND team IN (${drop.map(() => "?").join(",")})`,
              )
              .bind(season, ...drop),
          ]
        : []),
      ...upsertStatements(db, "team_official_stats", official, ["season", "team"]),
    ]);
  }
}

type Ev = Record<string, number | string | null> & {
  team: number;
  event_code: string;
  date_end: string;
  official: number | null;
};
type Best = { team: number; official: number | null; match_id: number; best_np: number };

function rollupRows(season: number, chunk: number[], evs: Ev[], bests: Best[], now: string) {
  const best = new Map<number, Best>();
  for (const b of bests) {
    const cur = best.get(b.team);
    if (!cur || b.best_np > cur.best_np) best.set(b.team, b);
  }
  return chunk.flatMap((team) => {
    const mine = evs.filter((e) => e.team === team);
    if (mine.length === 0) return [];
    const num = (e: Ev, k: string) => (e[k] as number | null) ?? Number.NEGATIVE_INFINITY;
    const top = (k: string) => {
      const v = Math.max(...mine.map((e) => num(e, k)));
      return Number.isFinite(v) ? v : null;
    };
    const bestEv = mine.reduce((a, b) => (num(b, "opr_np") > num(a, "opr_np") ? b : a));
    const latest = mine.reduce((a, b) => (b.date_end > a.date_end ? b : a));
    const sum = (k: string) => mine.reduce((n, e) => n + ((e[k] as number) ?? 0), 0);
    return [
      {
        season,
        team,
        events_played: mine.length,
        played: sum("played"),
        wins: sum("wins"),
        losses: sum("losses"),
        ties: sum("ties"),
        best_event: bestEv.event_code,
        best_opr_np: top("opr_np"),
        best_opr_auto: top("opr_auto"),
        best_opr_teleop: top("opr_teleop"),
        best_opr_endgame: top("opr_endgame"),
        best_opr_c1: top("opr_c1"),
        best_opr_c2: top("opr_c2"),
        best_opr_c3: top("opr_c3"),
        best_opr_c4: top("opr_c4"),
        latest_event: latest.event_code,
        latest_opr_np: (latest.opr_np as number | null) ?? null,
        best_np_match_id: best.get(team)?.match_id ?? null,
        best_np: best.get(team)?.best_np ?? null,
        updated_at: now,
      },
    ];
  });
}
