import { nowIso } from "@ftcref/db";
import type { Env, SyncMessage } from "./env";

/** Event kinds that never have matches; skipping them saves ~30% of backfill requests. */
const NON_COMPETITION = [
  "Kickoff",
  "Workshop",
  "DemoExhibition",
  "VolunteerSignup",
  "PracticeDay",
  "InnovationChallenge",
];

const MIN = 60_000;

/**
 * One step of the season backfill state machine, run every minute. Seasons are processed one at a
 * time, newest first, on the throttled backfill queue (so live polling never waits behind history):
 *
 *   NULL      → queue events, teams, leagues                       → 'events'
 *   'events'  → once events exist, queue every event's matches/awards → 'matches'
 *   'matches' → once the queue has gone quiet for this season       → backfilled_at = now
 */
export async function advanceBackfill(env: Env, enqueueBulk: (m: SyncMessage[]) => Promise<void>) {
  const s = await env.DB.prepare(
    "SELECT year, backfill_stage, backfill_stage_at FROM seasons WHERE backfilled_at IS NULL ORDER BY year DESC LIMIT 1",
  ).first<{ year: number; backfill_stage: string | null; backfill_stage_at: string | null }>();
  if (!s) return repairFailedEvents(env, enqueueBulk);
  const season = s.year;
  const since = s.backfill_stage_at ? Date.now() - Date.parse(s.backfill_stage_at) : Number.POSITIVE_INFINITY;
  const setStage = (stage: string, done = false) =>
    env.DB.prepare(
      "UPDATE seasons SET backfill_stage = ?, backfill_stage_at = ?, backfilled_at = ? WHERE year = ?",
    )
      .bind(stage, nowIso(), done ? nowIso() : null, season)
      .run();

  if (!s.backfill_stage) {
    await enqueueBulk([
      { job: "events", season },
      { job: "teams", season, page: 1, force: true },
      { job: "leagues", season },
    ]);
    await setStage("events");
    return `${season}: queued events/teams/leagues`;
  }

  if (s.backfill_stage === "events") {
    const ev = await env.DB.prepare("SELECT COUNT(*) AS n FROM events WHERE season = ?")
      .bind(season)
      .first<{ n: number }>();
    if (!ev?.n || since < 2 * MIN) return `${season}: waiting for events`;
    const today = new Date().toISOString().slice(0, 10);
    const ph = NON_COMPETITION.map(() => "?").join(",");
    const { results } = await env.DB.prepare(
      `SELECT code FROM events WHERE season = ? AND substr(date_start, 1, 10) <= ?
       AND (kind IS NULL OR kind NOT IN (${ph})) ORDER BY date_start`,
    )
      .bind(season, today, ...NON_COMPETITION)
      .all<{ code: string }>();
    await enqueueBulk(
      results.flatMap(({ code }): SyncMessage[] => [
        { job: "eventMatches", season, code, force: true },
        { job: "awards", season, code, force: true },
      ]),
    );
    await setStage("matches");
    return `${season}: queued ${results.length} events`;
  }

  if (s.backfill_stage === "matches") {
    // Backfill jobs log target "~{season}/…"; quiet for 5 minutes ⇒ the backlog drained.
    const last = await env.DB.prepare("SELECT MAX(started_at) AS t FROM sync_runs WHERE target LIKE ?")
      .bind(`~${season}/%`)
      .first<{ t: string | null }>();
    const quiet = !last?.t || Date.now() - Date.parse(last.t) > 5 * MIN;
    if (since > 10 * MIN && quiet) {
      await setStage("done", true);
      return `${season}: done`;
    }
    return `${season}: matches in progress`;
  }
  return null;
}

const REPAIR_KEY = "backfill/repair";
const MAX_REPAIRS_PER_EVENT = 3;

/**
 * Once an hour while no backfill is pending: re-queue historical events whose most recent sync
 * failed (transient D1/network errors, or retries exhausted before a fix shipped). Each event is
 * retried at most MAX_REPAIRS_PER_EVENT times so a permanently broken one can't loop forever.
 */
async function repairFailedEvents(env: Env, enqueueBulk: (m: SyncMessage[]) => Promise<void>) {
  const last = await env.DB.prepare("SELECT last_checked_at FROM sync_state WHERE key = ?")
    .bind(REPAIR_KEY)
    .first<{ last_checked_at: string | null }>();
  if (last?.last_checked_at && Date.now() - Date.parse(last.last_checked_at) < 60 * MIN) return null;

  const { results } = await env.DB.prepare(
    `SELECT r.target FROM sync_runs r
     WHERE r.job = 'eventMatches' AND r.target LIKE '~%/%' AND r.error IS NOT NULL
       AND r.id = (SELECT MAX(x.id) FROM sync_runs x WHERE x.job = 'eventMatches' AND x.target = r.target)
       AND (SELECT COUNT(*) FROM sync_runs y WHERE y.job = 'eventMatches' AND y.target = r.target) < ?
     GROUP BY r.target LIMIT 300`,
  )
    .bind(MAX_REPAIRS_PER_EVENT + 5) // 5 = the queue's own attempts on the first pass
    .all<{ target: string }>();
  const msgs: SyncMessage[] = results.flatMap(({ target }) => {
    const m = /^~(\d{4})\/([A-Z0-9]+)$/.exec(target);
    return m
      ? [{ job: "eventMatches" as const, season: Number(m[1]), code: m[2] as string, force: true }]
      : [];
  });
  if (msgs.length) await enqueueBulk(msgs);
  await env.DB.prepare(
    "INSERT INTO sync_state (key, last_checked_at) VALUES (?1, ?2) ON CONFLICT (key) DO UPDATE SET last_checked_at = ?2",
  )
    .bind(REPAIR_KEY, nowIso())
    .run();
  return msgs.length ? `repair: re-queued ${msgs.length} failed events` : null;
}
