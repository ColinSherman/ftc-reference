import { type MatchRef, parseTitle } from "./parse";
import { confident, type EventCandidate, type Resolved, resolveEvent } from "./resolve";
import type { YtVideo } from "./youtube";

export type Confidence = "high" | "low" | "none";

export interface Proposal {
  video: YtVideo;
  event: EventCandidate | null;
  ref: MatchRef | null;
  /** The match exists in our data for that event. */
  matchFound: boolean;
  confidence: Confidence;
  reason: string;
}

export const matchKey = (code: string, r: MatchRef) => `${code}|${r.level}|${r.series}|${r.number}`;

/**
 * Map a batch of videos (typically one playlist or a channel's uploads) to matches.
 * Event resolution order: an explicitly chosen event → the playlist title (one event for the whole
 * playlist, the common case) → each video's own title.
 */
export function planImport(
  videos: YtVideo[],
  events: EventCandidate[],
  hasMatch: (key: string) => boolean,
  opts: { playlistTitle?: string; event?: EventCandidate } = {},
): Proposal[] {
  let playlistEvent: Resolved | null = null;
  if (!opts.event && opts.playlistTitle) {
    const r = resolveEvent(parseTitle(opts.playlistTitle).eventText, events, {
      date: videos[0]?.publishedAt,
    });
    if (confident(r)) playlistEvent = r;
  }

  return videos.map((video): Proposal => {
    const parsed = parseTitle(video.title);
    if (parsed.kind === "test") {
      return {
        video,
        event: null,
        ref: null,
        matchFound: false,
        confidence: "none",
        reason: "test/practice match",
      };
    }
    if (parsed.kind === "none") {
      return {
        video,
        event: null,
        ref: null,
        matchFound: false,
        confidence: "none",
        reason: "no match number in title",
      };
    }
    let ev: EventCandidate | null = opts.event ?? playlistEvent?.event ?? null;
    let eventSure = !!ev;
    let reason = opts.event ? "chosen event" : playlistEvent ? "playlist title" : "";
    if (!ev) {
      const r = resolveEvent(parsed.eventText, events, { date: video.publishedAt });
      ev = r?.event ?? null;
      eventSure = confident(r);
      reason = r ? `title ~ "${r.event.name}" (${Math.round(r.score * 100)}%)` : "no event matched";
    }
    if (!ev) return { video, event: null, ref: parsed.ref, matchFound: false, confidence: "none", reason };
    const found = hasMatch(matchKey(ev.code, parsed.ref));
    return {
      video,
      event: ev,
      ref: parsed.ref,
      matchFound: found,
      confidence: found && eventSure ? "high" : found ? "low" : "none",
      reason: found ? reason : `${reason}; no such match at ${ev.code}`,
    };
  });
}
