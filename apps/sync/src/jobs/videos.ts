import { nowIso } from "@ftcref/db";
import { importVideos, recordApiUsage, YouTube } from "@ftcref/videos";
import type { Env } from "../env";
import { channelRss } from "./channelFeed";

/**
 * Re-scan channels marked auto_scan for new uploads and match them to FTC matches. A channel's first
 * scan reads up to 500 uploads through the Data API (~10 quota units); later scans use the free RSS
 * feed (newest 15 uploads, zero quota). Trusted channels' confident matches go live; the rest wait
 * in the review queue.
 */
export async function scanVideoChannels(env: Env) {
  if (!env.YOUTUBE_API_KEY) return { channels: 0, approved: 0, pending: 0 };
  const yt = new YouTube(env.YOUTUBE_API_KEY);
  const usage = { rss: 0 };
  try {
    const r = await scanInner(env, yt, usage);
    await recordApiUsage(env.DB, "youtube", yt.calls);
    await recordApiUsage(env.DB, "youtube_rss", usage.rss);
    return r;
  } catch (e) {
    await recordApiUsage(env.DB, "youtube", yt.calls, e);
    throw e;
  }
}

async function scanInner(env: Env, yt: YouTube, usage: { rss: number }) {
  const { results: channels } = await env.DB.prepare(
    "SELECT channel_id, trusted, last_scanned_at FROM video_channels WHERE auto_scan = 1",
  ).all<{ channel_id: string; trusted: number; last_scanned_at: string | null }>();

  let approved = 0;
  let pending = 0;
  for (const ch of channels) {
    if (ch.last_scanned_at) usage.rss++;
    const videos = ch.last_scanned_at
      ? await channelRss(env, ch.channel_id)
      : await yt.playlistVideos(YouTube.uploadsPlaylist(ch.channel_id), 10);
    if (!videos) continue; // feed failed: recorded on the channel, try again next scan
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
