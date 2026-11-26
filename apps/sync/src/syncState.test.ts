// Polling cadence depends on sync_state: the planner reads last_checked_at / last_changed_at through
// a key join, and trackedGet decides what counts as a change. Both once misfired in production and
// polled every live event every minute, so they run here against the real schema.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { FetchResult, FtcApi } from "@ftcref/ftc-api";
import { describe, expect, it } from "vitest";
import type { Env } from "./env";
import { planLive } from "./planner";
import { changed, trackedGet } from "./tracked";

const MIGRATIONS_DIR = join(__dirname, "../../../packages/db/migrations");

function schema() {
  const db = new DatabaseSync(":memory:");
  for (const f of readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort())
    db.exec(readFileSync(join(MIGRATIONS_DIR, f), "utf8"));
  return db;
}

/** D1 over node:sqlite. Like D1, node:sqlite binds JS numbers as REAL, which is what the planner bug hit. */
function d1(db: DatabaseSync): D1Database {
  const stmt = (sql: string, args: (string | number | null)[] = []) => {
    const run = () => {
      const s = db.prepare(sql);
      if (s.columns().length) return { results: s.all(...args), meta: { changes: 0 } };
      const r = s.run(...args);
      return { results: [], meta: { changes: Number(r.changes) } };
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

describe("planLive", () => {
  const now = new Date("2026-11-22T12:05:00Z");
  function seeded(lastChecked: string) {
    const db = schema();
    db.exec(`
      INSERT OR REPLACE INTO seasons (year, game_name, is_current) VALUES (2026, 'BIOBUZZ', 1);
      INSERT INTO events (season, code, name, timezone, date_start, date_end, remote, hybrid, published, updated_at)
      VALUES (2026, 'ENDED', 'Ended', 'Europe/London', '2026-11-20T00:00:00', '2026-11-20T00:00:00', 0, 1, 1, '${lastChecked}');
      INSERT INTO sync_state (key, last_checked_at, last_changed_at)
      VALUES ('2026/schedule/ENDED/qual/hybrid', '${lastChecked}', '2026-11-20T18:00:00Z');
    `);
    return { DB: d1(db) } as unknown as Env;
  }
  const matchJobs = async (env: Env, at = now) =>
    (await planLive(env, 2026, at)).filter((m) => m.job === "eventMatches");

  it("finds the event's sync_state, so an ended event is polled hourly, not every minute", async () => {
    const recent = new Date(now.getTime() - 10 * 60_000).toISOString();
    expect(await matchJobs(seeded(recent))).toEqual([]);
    const stale = new Date(now.getTime() - 61 * 60_000).toISOString();
    expect(await matchJobs(seeded(stale))).toEqual([{ job: "eventMatches", season: 2026, code: "ENDED" }]);
  });

  it("checks an ended event's awards hourly, not every 5 minutes", async () => {
    const env = seeded(now.toISOString());
    const awards = async (at: Date) => (await planLive(env, 2026, at)).filter((m) => m.job === "awards");
    expect(await awards(now)).toEqual([]);
    expect(await awards(new Date("2026-11-22T13:00:00Z"))).toHaveLength(1);
  });
});

describe("trackedGet", () => {
  /** An API that always answers 200 with `body` and no Last-Modified, like an empty playoff schedule. */
  const api = (body: string) =>
    ({
      get: async (): Promise<FetchResult<unknown>> => ({
        status: "ok",
        data: JSON.parse(body),
        lastModified: null,
        body,
      }),
    }) as unknown as FtcApi;
  const env = { DB: d1(schema()) } as unknown as Env;
  const path = "schedule/X/playoff/hybrid";
  const changedAt = () =>
    env.DB.prepare("SELECT last_changed_at AS t FROM sync_state WHERE key = ?")
      .bind(`2026/${path}`)
      .first<{ t: string }>();

  it("treats a 200 with the same body as not modified", async () => {
    const first = await trackedGet(env, api('{"schedule":[]}'), 2026, path);
    expect(changed(first)).toBe(true);
    await first.commit().run();
    const t0 = (await changedAt())?.t;

    const again = await trackedGet(env, api('{"schedule":[]}'), 2026, path);
    expect(changed(again)).toBe(false);
    await again.commit().run();
    expect((await changedAt())?.t).toBe(t0);

    const moved = await trackedGet(env, api('{"schedule":[{"matchNumber":1}]}'), 2026, path);
    expect(changed(moved)).toBe(true);
  });

  it("still reports a change when forced", async () => {
    const forced = await trackedGet(env, api('{"schedule":[]}'), 2026, path, true);
    expect(changed(forced)).toBe(true);
  });
});
