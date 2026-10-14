/**
 * Minimal YouTube Data API v3 client (https://developers.google.com/youtube/v3). Every call used
 * here costs 1 quota unit (default quota: 10,000/day), and a 50-item page is one call.
 */
const BASE = "https://www.googleapis.com/youtube/v3";

export interface YtVideo {
  videoId: string;
  title: string;
  /** When the video itself was published (falls back to when it was added to the playlist). */
  publishedAt: string;
  channelId: string;
  channelTitle: string;
}

export class YouTube {
  calls = 0;
  constructor(
    private readonly key: string,
    private readonly fetchImpl: typeof fetch = fetch.bind(globalThis),
  ) {}

  private async get<T>(path: string, params: Record<string, string>): Promise<T> {
    const u = new URL(`${BASE}/${path}`);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    u.searchParams.set("key", this.key);
    this.calls++;
    const res = await this.fetchImpl(u.toString());
    if (!res.ok) throw new Error(`YouTube ${path} ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return (await res.json()) as T;
  }

  /** All items of a playlist (newest-first order as YouTube returns it), up to `maxPages` × 50. */
  async playlistVideos(playlistId: string, maxPages = 10): Promise<YtVideo[]> {
    type Page = {
      nextPageToken?: string;
      items: {
        snippet: {
          title: string;
          publishedAt: string;
          channelId: string;
          channelTitle: string;
          videoOwnerChannelId?: string;
          videoOwnerChannelTitle?: string;
          resourceId: { videoId: string };
        };
        contentDetails?: { videoPublishedAt?: string };
      }[];
    };
    const out: YtVideo[] = [];
    let pageToken: string | undefined;
    for (let i = 0; i < maxPages; i++) {
      const page: Page = await this.get<Page>("playlistItems", {
        part: "snippet,contentDetails",
        playlistId,
        maxResults: "50",
        ...(pageToken ? { pageToken } : {}),
      });
      for (const it of page.items) {
        const s = it.snippet;
        if (s.title === "Private video" || s.title === "Deleted video") continue;
        out.push({
          videoId: s.resourceId.videoId,
          title: s.title,
          publishedAt: it.contentDetails?.videoPublishedAt ?? s.publishedAt,
          channelId: s.videoOwnerChannelId ?? s.channelId,
          channelTitle: s.videoOwnerChannelTitle ?? s.channelTitle,
        });
      }
      pageToken = page.nextPageToken;
      if (!pageToken) break;
    }
    return out;
  }

  async playlistTitle(
    playlistId: string,
  ): Promise<{ title: string; channelId: string; channelTitle: string } | null> {
    type R = { items: { snippet: { title: string; channelId: string; channelTitle: string } }[] };
    const r = await this.get<R>("playlists", { part: "snippet", id: playlistId });
    const s = r.items[0]?.snippet;
    return s ? { title: s.title, channelId: s.channelId, channelTitle: s.channelTitle } : null;
  }

  /** Channel id + title from an @handle. */
  async channelByHandle(handle: string): Promise<{ id: string; title: string } | null> {
    type R = { items?: { id: string; snippet: { title: string } }[] };
    const r = await this.get<R>("channels", { part: "snippet", forHandle: `@${handle.replace(/^@/, "")}` });
    const c = r.items?.[0];
    return c ? { id: c.id, title: c.snippet.title } : null;
  }

  async channelTitle(channelId: string): Promise<string | null> {
    type R = { items?: { snippet: { title: string } }[] };
    const r = await this.get<R>("channels", { part: "snippet", id: channelId });
    return r.items?.[0]?.snippet.title ?? null;
  }

  /** One video's details (for single-video submissions). */
  async video(videoId: string): Promise<YtVideo | null> {
    type R = {
      items?: {
        id: string;
        snippet: { title: string; publishedAt: string; channelId: string; channelTitle: string };
      }[];
    };
    const r = await this.get<R>("videos", { part: "snippet", id: videoId });
    const v = r.items?.[0];
    return v
      ? {
          videoId: v.id,
          title: v.snippet.title,
          publishedAt: v.snippet.publishedAt,
          channelId: v.snippet.channelId,
          channelTitle: v.snippet.channelTitle,
        }
      : null;
  }

  /**
   * Stream timing for up to 50 videos per call (1 unit). Non-live uploads come back with no
   * liveStreamingDetails; their window is publish time + duration.
   */
  async streamDetails(ids: string[]): Promise<StreamDetails[]> {
    type R = {
      items?: {
        id: string;
        snippet: { title: string; channelId: string; channelTitle: string; publishedAt: string };
        contentDetails?: { duration?: string };
        liveStreamingDetails?: {
          actualStartTime?: string;
          actualEndTime?: string;
          scheduledStartTime?: string;
        };
      }[];
    };
    const out: StreamDetails[] = [];
    for (let i = 0; i < ids.length; i += 50) {
      const r = await this.get<R>("videos", {
        part: "snippet,contentDetails,liveStreamingDetails",
        id: ids.slice(i, i + 50).join(","),
      });
      for (const v of r.items ?? []) {
        out.push({
          videoId: v.id,
          title: v.snippet.title,
          channelId: v.snippet.channelId,
          channelTitle: v.snippet.channelTitle,
          publishedAt: v.snippet.publishedAt,
          liveStart: v.liveStreamingDetails?.actualStartTime ?? null,
          liveEnd: v.liveStreamingDetails?.actualEndTime ?? null,
          durationS: isoDurationToSeconds(v.contentDetails?.duration),
        });
      }
    }
    return out;
  }

  /** A channel's uploads playlist id: UC… → UU…. */
  static uploadsPlaylist(channelId: string) {
    return `UU${channelId.slice(2)}`;
  }
}

export interface StreamDetails {
  videoId: string;
  title: string;
  channelId: string;
  channelTitle: string;
  publishedAt: string;
  liveStart: string | null;
  liveEnd: string | null;
  durationS: number | null;
}

/** "PT3H17M30S" → 11850. */
export function isoDurationToSeconds(d: string | undefined): number | null {
  const m = d ? /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(d) : null;
  if (!m) return null;
  return Number(m[1] ?? 0) * 86400 + Number(m[2] ?? 0) * 3600 + Number(m[3] ?? 0) * 60 + Number(m[4] ?? 0);
}

/**
 * Latest ~15 uploads of a channel (or a playlist) from YouTube's public RSS feed. Free: no API key
 * and no quota, so routine "anything new?" scans cost nothing.
 */
export async function rssVideos(
  ref: { channelId: string } | { playlistId: string },
  fetchImpl: typeof fetch = fetch.bind(globalThis),
): Promise<YtVideo[]> {
  const q = "channelId" in ref ? `channel_id=${ref.channelId}` : `playlist_id=${ref.playlistId}`;
  const res = await fetchImpl(`https://www.youtube.com/feeds/videos.xml?${q}`);
  if (!res.ok) throw new Error(`YouTube RSS ${res.status}`);
  return parseRss(await res.text());
}

const decode = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");

export function parseRss(xml: string): YtVideo[] {
  const channelTitle = decode(/<author>\s*<name>([^<]*)<\/name>/.exec(xml)?.[1] ?? "");
  const out: YtVideo[] = [];
  for (const entry of xml.split("<entry>").slice(1)) {
    const id = /<yt:videoId>([\w-]{11})<\/yt:videoId>/.exec(entry)?.[1];
    const title = /<title>([^<]*)<\/title>/.exec(entry)?.[1];
    const published = /<published>([^<]+)<\/published>/.exec(entry)?.[1];
    const channelId = /<yt:channelId>([^<]+)<\/yt:channelId>/.exec(entry)?.[1];
    if (id && title && published) {
      out.push({
        videoId: id,
        title: decode(title),
        publishedAt: published,
        channelId: channelId ?? "",
        channelTitle,
      });
    }
  }
  return out;
}
