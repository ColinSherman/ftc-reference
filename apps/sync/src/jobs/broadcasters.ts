import { nowIso } from "@ftcref/db";
import {
  alignMatches,
  autoTimedClip,
  type StreamWindow,
  similarity,
  tokens,
  VIDEO_MIN_SEASON,
  YouTube,
} from "@ftcref/videos";
import type { Env } from "../env";
import { channelRss } from "./channelFeed";

const DAY = 86_400_000;
/** Re-check streams that ended recently (processing finishes, matches get re-scored). */
const RECHECK_MS = 2 * DAY;

interface Candidate {
  season: number;
  code: string;
  name: string;
  timezone: string | null;
}

/**
 * Broadcaster channels stream whole events without FIRST linking them. For each of their streams,
 * find the event whose recorded matches fall inside the stream window (title similarity breaks ties
 * between concurrent divisions), then auto-time every match in it.
 * Cost: first pass reads ≤200 uploads (4 units); later passes use RSS (free); timing 1 unit / 50 streams.
 */
export async function alignBroadcasterStreams(env: Env, yt: YouTube, usage: { rss: number }) {
  const { results: channels } = await env.DB.prepare(
    "SELECT channel_id, title, region_code, last_scanned_at FROM video_channels WHERE broadcaster = 1",
  ).all<{
    channel_id: string;
    title: string | null;
    region_code: string | null;
    last_scanned_at: string | null;
  }>();

  let streamsMatched = 0;
  let matchesAligned = 0;
  for (const ch of channels) {
    if (ch.last_scanned_at) usage.rss++;
    let uploads = ch.last_scanned_at
      ? await channelRss(env, ch.channel_id)
      : await yt.playlistVideos(YouTube.uploadsPlaylist(ch.channel_id), 4);
    if (!uploads) continue; // feed failed: recorded on the channel, try again next pass
    // Only this and last season's streams (VIDEO_MIN_SEASON); skip streams already settled.
    const seasonStart = Date.parse(`${VIDEO_MIN_SEASON}-08-01`);
    uploads = uploads.filter((u) => Date.parse(u.publishedAt) >= seasonStart);
    if (uploads.length === 0) continue;
    const ph = uploads.map(() => "?").join(",");
    const { results: done } = await env.DB.prepare(
      `SELECT substr(key, 9) AS id, last_checked_at FROM sync_state WHERE key IN (${ph})`,
    )
      .bind(...uploads.map((u) => `bstream/${u.videoId}`))
      .all<{ id: string; last_checked_at: string }>();
    const settled = new Set(done.map((d) => d.id));
    const todo = uploads.filter(
      (u) => !settled.has(u.videoId) || Date.now() - Date.parse(u.publishedAt) < RECHECK_MS,
    );
    if (todo.length === 0) continue;

    for (const d of await yt.streamDetails(todo.map((u) => u.videoId))) {
      const startIso = d.liveStart ?? d.publishedAt;
      const startMs = Date.parse(startIso);
      const endMs = d.liveEnd ? Date.parse(d.liveEnd) : d.durationS ? startMs + d.durationS * 1000 : null;
      const now = nowIso();
      const logStream = (ev: Candidate | null, n: number) =>
        env.DB.prepare(
          `INSERT INTO channel_streams (video_id, channel_id, title, live_start, live_end, season, event_code, matches, checked_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
           ON CONFLICT (video_id) DO UPDATE SET title = ?3, live_start = ?4, live_end = ?5, season = ?6,
             event_code = ?7, matches = ?8, checked_at = ?9`,
        )
          .bind(
            d.videoId,
            ch.channel_id,
            d.title,
            d.liveStart ?? d.publishedAt,
            d.liveEnd,
            ev?.season ?? null,
            ev?.code ?? null,
            n,
            now,
          )
          .run();
      const mark = async (matched: string | null, ev: Candidate | null = null, n = 0) => {
        await logStream(ev, n);
        return env.DB.prepare(
          "INSERT INTO sync_state (key, last_checked_at, last_changed_at) VALUES (?1, ?2, ?3) " +
            "ON CONFLICT (key) DO UPDATE SET last_checked_at = ?2, last_changed_at = COALESCE(?3, last_changed_at)",
        )
          .bind(`bstream/${d.videoId}`, now, matched)
          .run();
      };
      if (!d.liveStart && !d.durationS) {
        await mark(null);
        continue;
      }
      const window: StreamWindow = { videoId: d.videoId, startMs, endMs };

      // Candidate events overlapping the stream's dates (±1 day for time zones), in the channel's region.
      const lo = new Date(startMs - DAY).toISOString().slice(0, 10);
      const hi = new Date((endMs ?? startMs) + DAY).toISOString().slice(0, 10);
      const { results: cands } = await env.DB.prepare(
        `SELECT season, code, name, timezone FROM events
         WHERE season >= ? AND remote = 0 AND substr(date_start, 1, 10) <= ? AND substr(date_end, 1, 10) >= ?
           AND (? IS NULL OR region_code = ?)`,
      )
        .bind(VIDEO_MIN_SEASON, hi, lo, ch.region_code, ch.region_code)
        .all<Candidate>();

      const titleTokens = tokens(d.title);
      let best: { ev: Candidate; aligned: { matchId: number; startS: number }[]; score: number } | null =
        null;
      for (const ev of cands) {
        const { results: ms } = await env.DB.prepare(
          "SELECT id, actual_start_at FROM matches WHERE season = ? AND event_code = ? AND played = 1 AND actual_start_at IS NOT NULL",
        )
          .bind(ev.season, ev.code)
          .all<{ id: number; actual_start_at: string }>();
        const { aligned } = alignMatches(ms, window, ev.timezone);
        if (aligned.length < 3) continue;
        // Time decides which events are possible; the title decides between concurrent ones.
        const score = aligned.length * (0.25 + similarity(titleTokens, tokens(ev.name)));
        if (!best || score > best.score) best = { ev, aligned, score };
      }
      if (!best) {
        await mark(null);
        continue;
      }
      const stmts = best.aligned.map((a) =>
        autoTimedClip(env.DB, {
          matchId: a.matchId,
          videoId: d.videoId,
          startS: a.startS,
          title: d.title,
          channelId: d.channelId,
          channelTitle: d.channelTitle,
          reason: `broadcaster stream matched by time + title (${best?.aligned.length} matches)`,
          now,
        }),
      );
      for (let i = 0; i < stmts.length; i += 100) await env.DB.batch(stmts.slice(i, i + 100));
      await mark(now, best.ev, best.aligned.length);
      await env.CACHE_VER.put(`event:${best.ev.season}:${best.ev.code}`, Date.now().toString(36));
      streamsMatched++;
      matchesAligned += best.aligned.length;
    }
    await env.DB.prepare("UPDATE video_channels SET last_scanned_at = ? WHERE channel_id = ?")
      .bind(nowIso(), ch.channel_id)
      .run();
  }
  return { streams: streamsMatched, matches: matchesAligned };
}
