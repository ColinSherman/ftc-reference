import { nowIso } from "@ftcref/db";
import {
  alignMatches,
  parseYoutubeSource,
  parseYoutubeUrl,
  rssVideos,
  type StreamDetails,
  type StreamWindow,
  YouTube,
} from "@ftcref/videos";
import type { Env } from "../env";

const DAY = 86_400_000;
const RETRY_LIVE_MS = 6 * 3_600_000;

interface Ev {
  season: number;
  code: string;
  timezone: string | null;
  date_start: string;
  date_end: string;
  live_stream_url: string;
}

/**
 * Auto-time matches inside the livestream FIRST lists for each event. Cost: ~1 quota unit per 50
 * streams, plus 1 per @handle lookup (`@team/live` links), so whole seasons align for a few dozen units.
 * Events are attempted once; events that ended in the last 2 days are retried every 6h (streams
 * finish processing after the event).
 */
export async function alignEventStreams(env: Env, limit = 200) {
  if (!env.YOUTUBE_API_KEY) return { events: 0, matches: 0 };
  const yt = new YouTube(env.YOUTUBE_API_KEY);
  const recent = new Date(Date.now() - 2 * DAY).toISOString().slice(0, 10);
  const { results: events } = await env.DB.prepare(
    `SELECT e.season, e.code, e.timezone, e.date_start, e.date_end, e.live_stream_url FROM events e
     LEFT JOIN sync_state s ON s.key = 'stream/' || e.season || '/' || e.code
     WHERE e.live_stream_url LIKE '%youtu%' AND e.remote = 0
       AND EXISTS (SELECT 1 FROM matches m WHERE m.season = e.season AND m.event_code = e.code
                   AND m.played = 1 AND m.actual_start_at IS NOT NULL)
       AND (s.key IS NULL OR (substr(e.date_end, 1, 10) >= ? AND s.last_checked_at < ?))
     ORDER BY e.date_start DESC LIMIT ?`,
  )
    .bind(recent, new Date(Date.now() - RETRY_LIVE_MS).toISOString(), limit)
    .all<Ev>();
  if (events.length === 0) return { events: 0, matches: 0 };

  // 1. Candidate stream video ids per event: direct links, or a channel's uploads around the event date.
  const candidates = new Map<string, string[]>(); // event key → video ids
  const handleCache = new Map<string, string | null>();
  for (const e of events) {
    const key = `${e.season}/${e.code}`;
    const direct = parseYoutubeUrl(e.live_stream_url);
    if (direct) {
      candidates.set(key, [direct.id]);
      continue;
    }
    const src = parseYoutubeSource(e.live_stream_url);
    let channelId: string | null = null;
    try {
      if (src?.kind === "channel") channelId = src.id;
      else if (src?.kind === "handle") {
        if (!handleCache.has(src.handle))
          handleCache.set(src.handle, (await yt.channelByHandle(src.handle))?.id ?? null);
        channelId = handleCache.get(src.handle) ?? null;
      }
      if (!channelId) continue;
      // RSS only covers the newest ~15 uploads: fine for recent events; older ones use the uploads playlist.
      const lo = Date.parse(e.date_start.slice(0, 10)) - DAY;
      const hi = Date.parse(e.date_end.slice(0, 10)) + 2 * DAY;
      const inWindow = (t: string) => Date.parse(t) >= lo && Date.parse(t) <= hi;
      let vids = (await rssVideos({ channelId })).filter((v) => inWindow(v.publishedAt));
      if (vids.length === 0 && Date.now() - lo > 60 * DAY) {
        vids = (await yt.playlistVideos(YouTube.uploadsPlaylist(channelId), 4)).filter((v) =>
          inWindow(v.publishedAt),
        );
      }
      if (vids.length)
        candidates.set(
          key,
          vids.map((v) => v.videoId),
        );
    } catch (err) {
      console.warn(`stream lookup ${key}`, err);
    }
  }

  // 2. Stream timing for every candidate (50 per call).
  const allIds = [...new Set([...candidates.values()].flat())];
  const details = new Map<string, StreamDetails>();
  for (const d of await yt.streamDetails(allIds)) details.set(d.videoId, d);
  const windowOf = (d: StreamDetails): StreamWindow | null => {
    const start = d.liveStart ?? d.publishedAt;
    if (!start) return null;
    const startMs = Date.parse(start);
    const endMs = d.liveEnd ? Date.parse(d.liveEnd) : d.durationS ? startMs + d.durationS * 1000 : null;
    return { videoId: d.videoId, startMs, endMs };
  };

  // 3. Align each event's matches; a match goes to the first stream that contains it.
  let matchesAligned = 0;
  const now = nowIso();
  for (const e of events) {
    const key = `${e.season}/${e.code}`;
    const ids = candidates.get(key) ?? [];
    const { results: matches } = await env.DB.prepare(
      "SELECT id, actual_start_at FROM matches WHERE season = ? AND event_code = ? AND played = 1 AND actual_start_at IS NOT NULL",
    )
      .bind(e.season, e.code)
      .all<{ id: number; actual_start_at: string }>();
    const placed = new Map<
      number,
      { videoId: string; startS: number; title: string; channel: string; channelId: string }
    >();
    for (const id of ids) {
      const d = details.get(id);
      const w = d ? windowOf(d) : null;
      if (!d || !w) continue;
      const { aligned } = alignMatches(matches, w, e.timezone);
      for (const a of aligned) {
        if (!placed.has(a.matchId)) {
          placed.set(a.matchId, {
            videoId: d.videoId,
            startS: a.startS,
            title: d.title,
            channel: d.channelTitle,
            channelId: d.channelId,
          });
        }
      }
    }
    // Require a real overlap before trusting it: at least 3 matches, or a third of the event.
    const ok = placed.size >= Math.min(3, matches.length) && placed.size >= matches.length / 3;
    const stmts: D1PreparedStatement[] = [];
    if (ok) {
      for (const [matchId, p] of placed) {
        stmts.push(
          env.DB.prepare(
            `INSERT OR IGNORE INTO videos (match_id, provider, video_id, start_s, source, status, title, channel_id,
               channel_title, confidence, reason, created_at, reviewed_at)
             VALUES (?, 'youtube', ?, ?, 'auto_align', 'approved', ?, ?, ?, 'high', ?, ?, ?)`,
          ).bind(
            matchId,
            p.videoId,
            p.startS,
            p.title,
            p.channelId,
            p.channel,
            `event livestream, auto-timed (${placed.size}/${matches.length} matches in stream)`,
            now,
            now,
          ),
        );
      }
      matchesAligned += placed.size;
    }
    stmts.push(
      env.DB.prepare(
        "INSERT INTO sync_state (key, last_checked_at, last_changed_at) VALUES (?1, ?2, ?3) " +
          "ON CONFLICT (key) DO UPDATE SET last_checked_at = ?2, last_changed_at = COALESCE(?3, last_changed_at)",
      ).bind(`stream/${key}`, now, ok ? now : null),
    );
    for (let i = 0; i < stmts.length; i += 100) await env.DB.batch(stmts.slice(i, i + 100));
    if (ok) await env.CACHE_VER.put(`event:${e.season}:${e.code}`, Date.now().toString(36));
  }
  return { events: events.length, matches: matchesAligned, quota: yt.calls };
}
