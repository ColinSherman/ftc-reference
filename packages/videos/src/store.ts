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
       WHERE substr(date_start, 1, 10) BETWEEN ? AND ? AND remote = 0`,
    )
    .bind(lo, hi)
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
