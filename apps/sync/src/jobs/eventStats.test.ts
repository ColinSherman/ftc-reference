import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { recomputeSeasonStats, refreshSeasonRanks } from "./eventStats";
import { eventCountsStatement } from "./events";

const MIGRATIONS_DIR = join(__dirname, "../../../../packages/db/migrations");
const MIGRATIONS = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(join(MIGRATIONS_DIR, f), "utf8"));

/** Enough of D1 over node:sqlite for the sync jobs' SQL. */
function d1(db: DatabaseSync): D1Database {
  const stmt = (sql: string, args: (string | number | null)[] = []) => {
    const run = () => {
      const s = db.prepare(sql);
      if (s.columns().length) return { results: s.all(...args) };
      s.run(...args);
      return { results: [] };
    };
    return {
      bind: (...a: (string | number | null)[]) => stmt(sql, a),
      first: async () => run().results[0] ?? null,
      all: async () => run(),
      run: async () => run(),
    };
  };
  return {
    prepare: (sql: string) => stmt(sql),
    batch: async (stmts: ReturnType<typeof stmt>[]) => Promise.all(stmts.map((s) => s.all())),
  } as unknown as D1Database;
}

const NOW = "2026-10-28T00:00:00Z";

/** Season 2026: team 1 plays a qualifier and an off-season event, team 2 only the off-season one. */
function seeded() {
  const db = new DatabaseSync(":memory:");
  for (const m of MIGRATIONS) db.exec(m);
  db.exec(`
    INSERT OR REPLACE INTO seasons (year, game_name, is_current) VALUES (2026, 'BIOBUZZ', 1);
    INSERT INTO events (season, code, name, date_start, date_end, remote, hybrid, published, updated_at, kind) VALUES
      (2026, 'QUAL', 'Qualifier', '2026-10-10', '2026-10-10', 0, 1, 1, '${NOW}', 'Qualifier'),
      (2026, 'OFF', 'Off-season', '2026-10-20', '2026-10-20', 0, 1, 1, '${NOW}', 'OffSeason');
    INSERT INTO team_seasons (season, number, updated_at) VALUES (2026, 1, '${NOW}'), (2026, 2, '${NOW}');
    INSERT INTO event_teams VALUES (2026, 'QUAL', 1), (2026, 'OFF', 1), (2026, 'OFF', 2);
    INSERT INTO matches (id, season, event_code, level, series, match_number, played, updated_at) VALUES
      (10, 2026, 'QUAL', 'Q', 0, 1, 1, '${NOW}'),
      (11, 2026, 'QUAL', 'Q', 0, 2, 0, '${NOW}'),
      (20, 2026, 'OFF', 'Q', 0, 1, 1, '${NOW}');
    INSERT INTO match_teams (match_id, station, alliance, team) VALUES
      (10, 'Red1', 'R', 1), (20, 'Red1', 'R', 1), (20, 'Blue1', 'B', 2);
    INSERT INTO match_scores (match_id, alliance, season, auto, teleop, endgame, np, total, c1, c2, c3, c4, detail, updated_at)
    VALUES (10, 'R', 2026, 0, 0, 0, 100, 100, 0, 0, 0, 0, '{}', '${NOW}'),
           (20, 'R', 2026, 0, 0, 0, 150, 150, 0, 0, 0, 0, '{}', '${NOW}'),
           (20, 'B', 2026, 0, 0, 0, 90, 90, 0, 0, 0, 0, '{}', '${NOW}');
    INSERT INTO team_event_stats (season, event_code, team, played, wins, losses, ties, opr_np, updated_at) VALUES
      (2026, 'QUAL', 1, 1, 1, 0, 0, 40, '${NOW}'),
      (2026, 'OFF', 1, 1, 1, 0, 0, 60, '${NOW}'),
      (2026, 'OFF', 2, 1, 0, 1, 0, 30, '${NOW}');
  `);
  return db;
}

const row = (db: DatabaseSync, sql: string) => db.prepare(sql).get() as Record<string, unknown>;

describe("stored counts", () => {
  it("counts an event's teams and played matches", async () => {
    const db = seeded();
    await eventCountsStatement(d1(db), 2026, "QUAL").run();
    expect(row(db, "SELECT team_count, played_count FROM events WHERE code = 'QUAL'")).toEqual({
      team_count: 1,
      played_count: 1,
    });
  });

  it("rolls event counts up into the season", async () => {
    const db = seeded();
    for (const code of ["QUAL", "OFF"]) await eventCountsStatement(d1(db), 2026, code).run();
    await refreshSeasonRanks(d1(db), 2026);
    expect(row(db, "SELECT event_count, team_count, played_count FROM seasons WHERE year = 2026")).toEqual({
      event_count: 2,
      team_count: 2,
      played_count: 2,
    });
  });
});

describe("recomputeSeasonStats", () => {
  it("keeps off-season out of the official table, and its best match too", async () => {
    const db = seeded();
    await recomputeSeasonStats(d1(db), 2026, [1, 2]);
    const all = db
      .prepare("SELECT team, events_played, best_opr_np, best_np, best_np_match_id FROM team_season_stats")
      .all();
    const official = db
      .prepare("SELECT team, events_played, best_opr_np, best_np, best_np_match_id FROM team_official_stats")
      .all();
    expect(all).toEqual([
      { team: 1, events_played: 2, best_opr_np: 60, best_np: 150, best_np_match_id: 20 },
      { team: 2, events_played: 1, best_opr_np: 30, best_np: 90, best_np_match_id: 20 },
    ]);
    expect(official).toEqual([
      { team: 1, events_played: 1, best_opr_np: 40, best_np: 100, best_np_match_id: 10 },
    ]);
  });

  it("drops a team from the official table once it has no season events", async () => {
    const db = seeded();
    db.exec(`INSERT INTO team_official_stats (season, team, events_played, played, wins, losses, ties, updated_at)
             VALUES (2026, 2, 1, 1, 0, 1, 0, '${NOW}')`);
    await recomputeSeasonStats(d1(db), 2026, [2]);
    expect(row(db, "SELECT COUNT(*) AS n FROM team_official_stats WHERE team = 2")).toEqual({ n: 0 });
  });
});
