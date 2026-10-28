import { bool, nowIso, runBatched, upsertStatements } from "@ftcref/db";
import { type ApiEvent, type FtcApi, FtcApiError } from "@ftcref/ftc-api";
import type { Env } from "../env";
import { changed, dataOf, trackedGet } from "../tracked";

export async function syncEvents(env: Env, api: FtcApi, season: number) {
  const t = await trackedGet<{ events: ApiEvent[] }>(env, api, season, "events");
  const events = dataOf(t)?.events ?? [];
  const now = nowIso();
  const rows = events.map((e) => ({
    season,
    code: e.code,
    name: e.name,
    type: e.type,
    type_name: e.typeName,
    kind: eventKind(e.typeName),
    division_code: e.divisionCode,
    parent_code: null,
    region_code: e.regionCode,
    league_code: e.leagueCode,
    district_code: e.districtCode,
    venue: e.venue,
    city: e.city,
    state_prov: e.stateprov,
    country: e.country,
    timezone: e.timezone,
    date_start: e.dateStart,
    date_end: e.dateEnd,
    remote: bool(e.remote),
    hybrid: bool(e.hybrid),
    field_count: e.fieldCount,
    published: bool(e.published),
    live_stream_url: e.liveStreamUrl,
    webcasts_json: e.webcasts?.length ? JSON.stringify(e.webcasts) : null,
    removed_at: null,
    updated_at: now,
  }));
  await runBatched(env.DB, [
    ...upsertStatements(env.DB, "events", rows, ["season", "code"]),
    ...(await removedStatements(env.DB, season, changed(t) ? rows.map((r) => r.code) : null, now)),
    t.commit(),
  ]);
  return rows.length;
}

/**
 * Flag events FIRST no longer lists. `codes` is the full season list from a 200 response (null on a
 * 304). A list much shorter than what we hold looks like a partial or broken response, so nothing is
 * flagged then: wrongly hiding live events is worse than retrying a few dead ones.
 */
export async function removedStatements(db: D1Database, season: number, codes: string[] | null, now: string) {
  if (!codes?.length) return [];
  const held = await db
    .prepare("SELECT COUNT(*) AS n FROM events WHERE season = ? AND removed_at IS NULL")
    .bind(season)
    .first<{ n: number }>();
  if (codes.length < 0.8 * (held?.n ?? 0)) {
    console.warn(`events ${season}: API listed ${codes.length} of ${held?.n} events; not flagging removals`);
    return [];
  }
  return [
    db
      .prepare(
        `UPDATE events SET removed_at = ?3
         WHERE season = ?1 AND removed_at IS NULL AND code NOT IN (SELECT value FROM json_each(?2))`,
      )
      .bind(season, JSON.stringify(codes), now),
  ];
}

/** FIRST answers this for an event code it no longer has (cancelled or renamed events). */
export const isInvalidEvent = (e: unknown) =>
  e instanceof FtcApiError && e.httpStatus === 404 && /Invalid Event Requested/i.test(e.message);

/** Flag one event as removed after its endpoints said it no longer exists. */
export const markRemoved = (db: D1Database, season: number, code: string) =>
  db
    .prepare("UPDATE events SET removed_at = COALESCE(removed_at, ?) WHERE season = ? AND code = ?")
    .bind(nowIso(), season, code)
    .run();

/**
 * Store one event's team and played-match counts (list pages show them), writing only when they moved.
 * Run after anything that changes the event's roster or results.
 */
export const eventCountsStatement = (db: D1Database, season: number, code: string) =>
  db
    .prepare(
      `UPDATE events SET team_count = c.t, played_count = c.p
       FROM (SELECT (SELECT COUNT(*) FROM event_teams WHERE season = ?1 AND event_code = ?2) AS t,
                    (SELECT COUNT(*) FROM matches WHERE season = ?1 AND event_code = ?2 AND played = 1) AS p) AS c
       WHERE season = ?1 AND code = ?2 AND (team_count IS NOT c.t OR played_count IS NOT c.p)`,
    )
    .bind(season, code);

/** FTCScout-style normalised type: "League Meet" → "LeagueMeet", "Non-Advancement" → "NonAdvancement". */
export const eventKind = (typeName: string | null | undefined) =>
  (typeName ?? "").replace(/[\s\-/]/g, "") || null;
