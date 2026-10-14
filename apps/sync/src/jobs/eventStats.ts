import { nowIso, runBatched, upsertStatements } from "@ftcref/db";
import { biobuzz, type Score2026Row } from "@ftcref/seasons";
import { type AllianceObs, computeOpr, mean, stddev } from "@ftcref/stats";

type ScoreJoin = Score2026Row & { match_id: number; level: string; winner: string | null };

/** Recompute s2026_team_event_stats for one event, then the season rollup for its teams. */
export async function recomputeEventStats(db: D1Database, season: number, code: string): Promise<number> {
  const [scoresRes, teamsRes, ranksRes] = await db.batch([
    db
      .prepare(
        `SELECT s.*, m.level, m.winner FROM matches m
         JOIN s2026_match_scores s ON s.match_id = m.id
         WHERE m.season = ? AND m.event_code = ? AND m.played = 1 AND m.level = 'Q'`,
      )
      .bind(season, code),
    db
      .prepare(
        `SELECT mt.match_id, mt.alliance, mt.team, mt.surrogate FROM match_teams mt
         JOIN matches m ON m.id = mt.match_id
         WHERE m.season = ? AND m.event_code = ? AND m.played = 1 AND m.level = 'Q'`,
      )
      .bind(season, code),
    db.prepare("SELECT team, rank FROM rankings WHERE season = ? AND event_code = ?").bind(season, code),
  ]);
  const scores = (scoresRes?.results ?? []) as ScoreJoin[];
  const mteams = (teamsRes?.results ?? []) as {
    match_id: number;
    alliance: string;
    team: number;
    surrogate: number;
  }[];
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

  const comps = biobuzz.oprComponents;
  const obs: AllianceObs[] = [];
  const perTeam = new Map<
    number,
    {
      np: number[];
      auto: number[];
      teleop: number[];
      tips: number[];
      rp: number[];
      w: number;
      l: number;
      t: number;
    }
  >();

  for (const s of scores) {
    const teams = teamsByAlliance.get(`${s.match_id}|${s.alliance}`) ?? [];
    const opp = byAlliance.get(`${s.match_id}|${s.alliance === "R" ? "B" : "R"}`);
    if (teams.length === 0) continue;
    // Components + opponent NP (→ DPR).
    obs.push({
      teams: teams.map((t) => t.team),
      values: [...comps.map((c) => c.value(s)), opp?.pre_foul_total ?? 0],
    });

    const won = s.winner === s.alliance;
    const tie = s.winner === "T";
    const rp = (won ? 3 : tie ? 1 : 0) + s.swarm_rp + s.pollinator1_rp + s.pollinator2_rp;
    for (const t of teams) {
      if (t.surrogate) continue;
      const p = perTeam.get(t.team) ?? { np: [], auto: [], teleop: [], tips: [], rp: [], w: 0, l: 0, t: 0 };
      p.np.push(s.pre_foul_total);
      p.auto.push(s.auto_pts);
      p.teleop.push(s.teleop_pts);
      p.tips.push(s.total_tips);
      p.rp.push(rp);
      if (won) p.w++;
      else if (tie) p.t++;
      else p.l++;
      perTeam.set(t.team, p);
    }
  }

  const opr = computeOpr(obs, comps.length + 1);
  const now = nowIso();
  const rows = [...perTeam].map(([team, p]) => {
    const o = opr.get(team) ?? [];
    const comp = Object.fromEntries(comps.map((c, i) => [c.col, round(o[i] ?? 0)]));
    const dpr = round(o[comps.length] ?? 0);
    const oprNp = comp.opr_np ?? 0;
    return {
      event_code: code,
      team,
      played: p.np.length,
      wins: p.w,
      losses: p.l,
      ties: p.t,
      rank: rankOf.get(team) ?? null,
      rp_avg: round(mean(p.rp)),
      ...comp,
      dpr,
      ccwm: round(oprNp - dpr),
      avg_np: round(mean(p.np)),
      avg_auto: round(mean(p.auto)),
      avg_teleop: round(mean(p.teleop)),
      avg_tips: round(mean(p.tips)),
      max_np: Math.max(...p.np),
      min_np: Math.min(...p.np),
      std_np: round(stddev(p.np)),
      updated_at: now,
    };
  });

  await runBatched(db, upsertStatements(db, "s2026_team_event_stats", rows, ["event_code", "team"]));
  await recomputeSeasonStats(db, season, [...perTeam.keys()]);
  return rows.length;
}

/** Season rollup per team: best / latest event OPRs and best single-match NP. */
export async function recomputeSeasonStats(db: D1Database, season: number, teams: number[]) {
  const now = nowIso();
  for (let i = 0; i < teams.length; i += 90) {
    const chunk = teams.slice(i, i + 90);
    const ph = chunk.map(() => "?").join(",");
    const [evRes, bestRes] = await db.batch([
      db
        .prepare(
          `SELECT t.*, e.date_end FROM s2026_team_event_stats t
           JOIN events e ON e.season = ? AND e.code = t.event_code
           WHERE t.team IN (${ph})`,
        )
        .bind(season, ...chunk),
      db
        .prepare(
          `SELECT mt.team, s.match_id, MAX(s.pre_foul_total) AS best_np
           FROM match_teams mt
           JOIN matches m ON m.id = mt.match_id AND m.season = ?
           JOIN s2026_match_scores s ON s.match_id = mt.match_id AND s.alliance = mt.alliance
           WHERE mt.team IN (${ph}) AND mt.surrogate = 0
           GROUP BY mt.team`,
        )
        .bind(season, ...chunk),
    ]);
    type Ev = Record<string, number | string | null> & { team: number; event_code: string; date_end: string };
    const evs = (evRes?.results ?? []) as Ev[];
    const best = new Map(
      ((bestRes?.results ?? []) as { team: number; match_id: number; best_np: number }[]).map((b) => [
        b.team,
        b,
      ]),
    );
    const rows = chunk.flatMap((team) => {
      const mine = evs.filter((e) => e.team === team);
      if (mine.length === 0) return [];
      const num = (e: Ev, k: string) => (e[k] as number | null) ?? Number.NEGATIVE_INFINITY;
      const top = (k: string) => Math.max(...mine.map((e) => num(e, k)));
      const bestEv = mine.reduce((a, b) => (num(b, "opr_np") > num(a, "opr_np") ? b : a));
      const latest = mine.reduce((a, b) => (b.date_end > a.date_end ? b : a));
      const sum = (k: string) => mine.reduce((n, e) => n + ((e[k] as number) ?? 0), 0);
      return [
        {
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
          best_opr_tips: top("opr_tips"),
          best_opr_flower: top("opr_flower"),
          latest_event: latest.event_code,
          latest_opr_np: (latest.opr_np as number | null) ?? null,
          best_np_match_id: best.get(team)?.match_id ?? null,
          best_np: best.get(team)?.best_np ?? null,
          updated_at: now,
        },
      ];
    });
    await runBatched(db, upsertStatements(db, "s2026_team_season_stats", rows, ["team"]));
  }
}

const round = (x: number) => Math.round(x * 100) / 100;
