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

  /** A channel's uploads playlist id: UC… → UU…. */
  static uploadsPlaylist(channelId: string) {
    return `UU${channelId.slice(2)}`;
  }
}
