/**
 * Livestream auto-timing. FIRST records each match's actual start (event-local wall clock, no zone);
 * YouTube records when a stream actually went live (UTC). The difference is the match's offset into
 * the stream — one quota unit per 50 streams, no human needed.
 */

/** Milliseconds `tz` is ahead of UTC at instant `utcMs` (e.g. -7h for Los Angeles in summer). */
export function tzOffsetMs(tz: string, utcMs: number): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const p = Object.fromEntries(dtf.formatToParts(new Date(utcMs)).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour) % 24,
    Number(p.minute),
    Number(p.second),
  );
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/** "2025-12-06T11:34:22.091" in `tz` → UTC epoch ms. */
export function localToUtcMs(local: string, tz: string | null): number {
  const naive = Date.parse(`${local.replace(/Z$/, "").slice(0, 23)}Z`);
  if (!tz) return naive;
  try {
    // Two passes handle DST boundaries.
    let guess = naive - tzOffsetMs(tz, naive);
    guess = naive - tzOffsetMs(tz, guess);
    return guess;
  } catch {
    return naive;
  }
}

export interface StreamWindow {
  videoId: string;
  startMs: number;
  /** Null while still live. */
  endMs: number | null;
}

export interface AlignedMatch {
  matchId: number;
  startS: number;
}

/** Seconds before FIRST's recorded start to begin playback (catch the field reset + countdown). */
export const LEAD_S = 15;

/**
 * Place each match inside the stream. Matches outside the stream window (other days, before the
 * stream started) are dropped. Returns the aligned matches and the share that fit, which callers use
 * as a sanity check that this really is the right stream.
 */
export function alignMatches(
  matches: { id: number; actual_start_at: string | null }[],
  stream: StreamWindow,
  tz: string | null,
): { aligned: AlignedMatch[]; fit: number } {
  const timed = matches.filter((m) => m.actual_start_at);
  const aligned: AlignedMatch[] = [];
  for (const m of timed) {
    const off = (localToUtcMs(m.actual_start_at as string, tz) - stream.startMs) / 1000;
    const end = stream.endMs == null ? Number.POSITIVE_INFINITY : (stream.endMs - stream.startMs) / 1000;
    if (off >= 0 && off <= end)
      aligned.push({ matchId: m.id, startS: Math.max(0, Math.round(off - LEAD_S)) });
  }
  return { aligned, fit: timed.length ? aligned.length / timed.length : 0 };
}
