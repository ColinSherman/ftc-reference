import { nowIso } from "@ftcref/db";
import { rssVideos, type YtVideo } from "@ftcref/videos";
import type { Env } from "../env";

/**
 * A channel's RSS uploads, or null if its feed failed (deleted or renamed channel, or YouTube's feed
 * endpoint having a bad moment). One bad channel must not abort the scan of the others, so the error
 * is stored on the channel for the admin health page instead of thrown, and cleared on the next
 * successful fetch.
 */
export async function channelRss(env: Env, channelId: string): Promise<YtVideo[] | null> {
  try {
    const videos = await rssVideos({ channelId });
    await env.DB.prepare(
      "UPDATE video_channels SET last_error = NULL, last_error_at = NULL WHERE channel_id = ? AND last_error IS NOT NULL",
    )
      .bind(channelId)
      .run();
    return videos;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`channel feed ${channelId}: ${msg}`);
    await env.DB.prepare("UPDATE video_channels SET last_error = ?, last_error_at = ? WHERE channel_id = ?")
      .bind(msg.slice(0, 300), nowIso(), channelId)
      .run();
    return null;
  }
}
