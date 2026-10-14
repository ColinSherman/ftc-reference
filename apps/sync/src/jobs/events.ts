import { bool, nowIso, runBatched, upsertStatements } from "@ftcref/db";
import type { ApiEvent, FtcApi } from "@ftcref/ftc-api";
import type { Env } from "../env";
import { dataOf, trackedGet } from "../tracked";

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
    updated_at: now,
  }));
  await runBatched(env.DB, [...upsertStatements(env.DB, "events", rows, ["season", "code"]), t.commit()]);
  return rows.length;
}
