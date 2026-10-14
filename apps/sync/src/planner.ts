import type { Env, SyncMessage } from "./env";

export interface PlanRow {
  code: string;
  timezone: string | null;
  date_start: string;
  date_end: string;
  last_checked_at: string | null;
  last_changed_at: string | null;
}

const MIN = 60_000;
const DAY = 86_400_000;

/** Local calendar date (YYYY-MM-DD) in the event's timezone. */
export function localDate(now: Date, tz: string | null) {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz ?? "UTC" }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

/**
 * Adaptive cadence:
 *  live + a change within 20 min → every minute
 *  live but quiet                → every 5 minutes
 *  ended ≤ 2 days ago            → hourly (late corrections)
 * Older events are covered by the daily full re-sync.
 */
export function isDue(e: PlanRow, now: Date): boolean {
  const today = localDate(now, e.timezone);
  const start = e.date_start.slice(0, 10);
  const end = e.date_end.slice(0, 10);
  const sinceCheck = e.last_checked_at
    ? now.getTime() - Date.parse(e.last_checked_at)
    : Number.POSITIVE_INFINITY;
  const sinceChange = e.last_changed_at
    ? now.getTime() - Date.parse(e.last_changed_at)
    : Number.POSITIVE_INFINITY;

  if (today >= start && today <= end) return sinceChange < 20 * MIN || sinceCheck >= 5 * MIN - 5_000;
  if (today > end) return sinceCheck >= 60 * MIN - 5_000;
  return false;
}

export async function planLive(env: Env, season: number, now = new Date()): Promise<SyncMessage[]> {
  const lo = new Date(now.getTime() - 3 * DAY).toISOString().slice(0, 10);
  const hi = new Date(now.getTime() + DAY).toISOString().slice(0, 10);
  const { results } = await env.DB.prepare(
    `SELECT e.code, e.timezone, e.date_start, e.date_end, s.last_checked_at, s.last_changed_at
     FROM events e
     LEFT JOIN sync_state s ON s.key = ?1 || '/schedule/' || e.code || '/qual/hybrid'
     WHERE e.season = ?1 AND substr(e.date_start, 1, 10) <= ?3 AND substr(e.date_end, 1, 10) >= ?2`,
  )
    .bind(season, lo, hi)
    .all<PlanRow>();

  const msgs: SyncMessage[] = [];
  const awardsTick = now.getUTCMinutes() % 5 === 0;
  for (const e of results) {
    if (isDue(e, now)) msgs.push({ job: "eventMatches", season, code: e.code });
    if (awardsTick && localDate(now, e.timezone) >= e.date_start.slice(0, 10)) {
      msgs.push({ job: "awards", season, code: e.code });
    }
  }
  return msgs;
}

/** Events active within the last 30 days, for the daily forced re-sync. */
export async function recentEvents(env: Env, season: number, now = new Date()) {
  const lo = new Date(now.getTime() - 30 * DAY).toISOString().slice(0, 10);
  const today = now.toISOString().slice(0, 10);
  const { results } = await env.DB.prepare(
    "SELECT code FROM events WHERE season = ? AND substr(date_start, 1, 10) <= ? AND substr(date_end, 1, 10) >= ?",
  )
    .bind(season, today, lo)
    .all<{ code: string }>();
  return results.map((r) => r.code);
}
