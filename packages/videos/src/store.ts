import { matchKey, type Proposal, planImport } from "./plan";
import type { EventCandidate } from "./resolve";
import type { YtVideo } from "./youtube";

/** Anything with D1's prepare/batch (a D1Database or a read-replica session). */
type Db = Pick<D1Database, "prepare" | "batch">;

export interface ImportResult {
  proposals: (Proposal & { matchId: number | null; status: "approved" | "pending" | "skipped" | "exists" })[];
  approved: number;
  pending: number;
  /** "season:code" of events whose pages need a cache bump (videos approved). */
  touched: string[];
}

const DAY = 86_400_000;

/** Automatic video matching/timing covers these seasons for now (DECODE 2025 → current). */
export const VIDEO_MIN_SEASON = 2025;

/**
 * Match a batch of YouTube videos to FTC matches and store them. Confident matches from trusted
 * channels go live immediately; everything else that found a match waits for review.
 */
export async function importVideos(
  db: Db,
  videos: YtVideo[],
  opts: {
    playlistTitle?: string;
    /** Force every video to this event ("season/CODE"). */
    event?: string;
    source: "user" | "scan" | "playlist";
    submittedBy?: string | null;
    trusted: boolean;
  },
): Promise<ImportResult> {
  if (videos.length === 0) return { proposals: [], approved: 0, pending: 0, touched: [] };

  // Candidate events: anything that started up to 120 days before the earliest video and before the latest.
  const times = videos.map((v) => Date.parse(v.publishedAt)).filter(Number.isFinite);
  const lo = new Date(Math.min(...times) - 120 * DAY).toISOString().slice(0, 10);
  const hi = new Date(Math.max(...times) + 2 * DAY).toISOString().slice(0, 10);
  let forced: EventCandidate | undefined;
  if (opts.event) {
    const [s, c] = opts.event.split("/");
    forced =
      (await db
        .prepare("SELECT season, code, name, date_start, date_end FROM events WHERE season = ? AND code = ?")
        .bind(Number(s), (c ?? "").toUpperCase())
        .first<EventCandidate>()) ?? undefined;
  }
  const { results: events } = await db
    .prepare(
      `SELECT season, code, name, date_start, date_end FROM events
       WHERE substr(date_start, 1, 10) BETWEEN ? AND ? AND remote = 0 AND season >= ?`,
    )
    .bind(lo, hi, VIDEO_MIN_SEASON)
    .all<EventCandidate>();

  // Pass 1: resolve events/match refs; pass 2: look up the actual match ids.
  const draft = planImport(videos, events, () => true, { playlistTitle: opts.playlistTitle, event: forced });
  const byEvent = new Map<string, EventCandidate>();
  for (const p of draft) if (p.event) byEvent.set(`${p.event.season}/${p.event.code}`, p.event);
  const ids = new Map<string, number>();
  for (const ev of byEvent.values()) {
    const { results } = await db
      .prepare("SELECT id, level, series, match_number FROM matches WHERE season = ? AND event_code = ?")
      .bind(ev.season, ev.code)
      .all<{ id: number; level: string; series: number; match_number: number }>();
    for (const m of results) {
      ids.set(matchKey(ev.code, { level: m.level as "Q", series: m.series, number: m.match_number }), m.id);
    }
  }
  const plan = planImport(videos, events, (k) => ids.has(k), {
    playlistTitle: opts.playlistTitle,
    event: forced,
  });

  const now = new Date().toISOString();
  const stmts: D1PreparedStatement[] = [];
  const touched = new Set<string>();
  let approved = 0;
  let pending = 0;
  const proposals = plan.map((p) => {
    const matchId = p.event && p.ref ? (ids.get(matchKey(p.event.code, p.ref)) ?? null) : null;
    if (!matchId || p.confidence === "none") return { ...p, matchId, status: "skipped" as const };
    const status: "approved" | "pending" = opts.trusted && p.confidence === "high" ? "approved" : "pending";
    if (status === "approved") {
      approved++;
      touched.add(`${p.event?.season}:${p.event?.code}`);
    } else pending++;
    stmts.push(
      db
        .prepare(
          `INSERT OR IGNORE INTO videos (match_id, provider, video_id, start_s, source, submitted_by, status, title,
             channel_id, channel_title, published_at, confidence, reason, created_at, reviewed_at)
           VALUES (?, 'youtube', ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          matchId,
          p.video.videoId,
          opts.source,
          opts.submittedBy ?? null,
          status,
          p.video.title,
          p.video.channelId,
          p.video.channelTitle,
          p.video.publishedAt,
          p.confidence,
          p.reason,
          now,
          status === "approved" ? now : null,
        ),
    );
    return { ...p, matchId, status };
  });
  for (let i = 0; i < stmts.length; i += 100) await db.batch(stmts.slice(i, i + 100));
  return { proposals, approved, pending, touched: [...touched] };
}

/** Single video → one specific match (from the match page's "add video" form). */
export async function submitMatchVideo(
  db: Db,
  matchId: number,
  video: { id: string; start?: number },
  submittedBy: string | null,
) {
  await db
    .prepare(
      `INSERT OR IGNORE INTO videos (match_id, provider, video_id, start_s, source, submitted_by, status, confidence, reason, created_at)
       VALUES (?, 'youtube', ?, ?, 'user', ?, 'pending', 'low', 'submitted on match page', ?)`,
    )
    .bind(matchId, video.id, video.start ?? null, submittedBy, new Date().toISOString())
    .run();
}

/**
 * Time a whole-event video from ONE known point ("Q1 starts at 0:12:34"). FIRST's recorded start of
 * every other match gives its offset relative to the anchor; offsets outside the video are dropped.
 * Works for uncut uploads (no livestream metadata) and for re-timing an auto-aligned stream.
 */
export async function anchorAlign(
  db: Db,
  opts: {
    season: number;
    code: string;
    videoId: string;
    anchor: { level: string; series: number; number: number };
    anchorS: number;
    durationS: number | null;
    title?: string | null;
    channelId?: string | null;
    channelTitle?: string | null;
    submittedBy?: string | null;
    approved: boolean;
  },
): Promise<{ placed: number; skipped: number; reason?: string }> {
  const { results: matches } = await db
    .prepare(
      `SELECT id, level, series, match_number, actual_start_at FROM matches
       WHERE season = ? AND event_code = ? AND played = 1 AND actual_start_at IS NOT NULL`,
    )
    .bind(opts.season, opts.code)
    .all<{ id: number; level: string; series: number; match_number: number; actual_start_at: string }>();
  const anchor = matches.find(
    (m) =>
      m.level === opts.anchor.level &&
      m.series === opts.anchor.series &&
      m.match_number === opts.anchor.number,
  );
  if (!anchor)
    return { placed: 0, skipped: matches.length, reason: "anchor match has no recorded start time" };
  // Same-zone wall clocks: the difference needs no time zone.
  const t0 = Date.parse(`${anchor.actual_start_at.slice(0, 23)}Z`);
  const now = new Date().toISOString();
  const stmts: D1PreparedStatement[] = [];
  let skipped = 0;
  for (const m of matches) {
    const off = opts.anchorS + (Date.parse(`${m.actual_start_at.slice(0, 23)}Z`) - t0) / 1000;
    if (off < 0 || (opts.durationS != null && off > opts.durationS)) {
      skipped++;
      continue;
    }
    // The anchor is where the match visibly starts, so no extra lead-in beyond a few seconds.
    const start = Math.max(0, Math.round(off - 5));
    stmts.push(
      db
        .prepare(
          `INSERT INTO videos (match_id, provider, video_id, start_s, source, submitted_by, status, title, channel_id,
             channel_title, confidence, reason, created_at, reviewed_at)
           VALUES (?, 'youtube', ?, ?, 'anchor', ?, ?, ?, ?, ?, 'high', ?, ?, ?)
           ON CONFLICT DO NOTHING`,
        )
        .bind(
          m.id,
          opts.videoId,
          start,
          opts.submittedBy ?? null,
          opts.approved ? "approved" : "pending",
          opts.title ?? null,
          opts.channelId ?? null,
          opts.channelTitle ?? null,
          `full-event video timed from ${opts.anchor.level}${opts.anchor.number} @ ${opts.anchorS}s`,
          now,
          opts.approved ? now : null,
        ),
    );
  }
  // A manual anchor supersedes auto-timing (and any earlier anchor) of the same video at this event,
  // and redefines its timing, so any stored manual shift no longer applies.
  stmts.unshift(db.prepare("DELETE FROM stream_shifts WHERE video_id = ?").bind(opts.videoId));
  stmts.unshift(
    db
      .prepare(
        `DELETE FROM videos WHERE video_id = ? AND source IN ('auto_align', 'anchor')
         AND match_id IN (SELECT id FROM matches WHERE season = ? AND event_code = ?)`,
      )
      .bind(opts.videoId, opts.season, opts.code),
  );
  for (let i = 0; i < stmts.length; i += 100) await db.batch(stmts.slice(i, i + 100));
  return { placed: stmts.length - 2, skipped };
}

/**
 * Insert one auto-timed clip. Applies the video's manual shift (stream_shifts) and never duplicates
 * a match already linked to this video, so re-syncs can't undo a manual timing adjustment.
 */
export function autoTimedClip(
  db: Pick<D1Database, "prepare">,
  c: {
    matchId: number;
    videoId: string;
    startS: number;
    title: string | null;
    channelId: string | null;
    channelTitle: string | null;
    reason: string;
    now: string;
  },
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO videos (match_id, provider, video_id, start_s, source, status, title, channel_id,
         channel_title, confidence, reason, created_at, reviewed_at)
       SELECT ?1, 'youtube', ?2, MAX(0, ?3 + COALESCE((SELECT shift_s FROM stream_shifts WHERE video_id = ?2), 0)),
              'auto_align', 'approved', ?4, ?5, ?6, 'high', ?7, ?8, ?8
       WHERE NOT EXISTS (SELECT 1 FROM videos WHERE match_id = ?1 AND video_id = ?2)`,
    )
    .bind(c.matchId, c.videoId, c.startS, c.title, c.channelId, c.channelTitle, c.reason, c.now);
}
