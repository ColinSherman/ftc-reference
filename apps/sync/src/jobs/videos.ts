import { nowIso } from "@ftcref/db";
import { importVideos, YouTube } from "@ftcref/videos";
import type { Env } from "../env";

/**
 * Re-scan channels marked auto_scan for new uploads and match them to FTC matches. First scan of a
 * channel reads up to 500 uploads; later scans read the newest 100. Trusted channels' confident
 * matches go live; the rest wait in the review queue.
 */
export async function scanVideoChannels(env: Env) {
  if (!env.YOUTUBE_API_KEY) return { channels: 0, approved: 0, pending: 0 };
  const yt = new YouTube(env.YOUTUBE_API_KEY);
  const { results: channels } = await env.DB.prepare(
    "SELECT channel_id, trusted, last_scanned_at FROM video_channels WHERE auto_scan = 1",
  ).all<{ channel_id: string; trusted: number; last_scanned_at: string | null }>();

  let approved = 0;
  let pending = 0;
  for (const ch of channels) {
    const videos = await yt.playlistVideos(
      YouTube.uploadsPlaylist(ch.channel_id),
      ch.last_scanned_at ? 2 : 10,
    );
    const r = await importVideos(env.DB, videos, { source: "scan", trusted: !!ch.trusted });
    approved += r.approved;
    pending += r.pending;
    for (const t of r.touched) {
      const [season, code] = t.split(":");
      await env.CACHE_VER.put(`event:${season}:${code}`, Date.now().toString(36));
    }
    await env.DB.prepare("UPDATE video_channels SET last_scanned_at = ? WHERE channel_id = ?")
      .bind(nowIso(), ch.channel_id)
      .run();
  }
  return { channels: channels.length, approved, pending };
}
