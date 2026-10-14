/**
 * Resolve free text ("SoCal FTC Group H 2025 Scrimmage 2") to an FTC event by token similarity,
 * nudged by date proximity. Event codes appearing verbatim in the text win outright.
 */
export interface EventCandidate {
  season: number;
  code: string;
  name: string;
  date_start: string;
  date_end: string;
}

export interface Resolved {
  event: EventCandidate;
  score: number;
  /** Gap to the runner-up; small gaps mean ambiguity. */
  margin: number;
}

const STOP = new Set([
  "ftc",
  "first",
  "tech",
  "challenge",
  "the",
  "of",
  "and",
  "at",
  "a",
  "event",
  "robotics",
  "match",
  "matches",
  "video",
  "live",
  "stream",
  "livestream",
  "day",
]);
// Words that distinguish events of the same series: keep numbers and these.
const ALIASES: Record<string, string> = {
  quals: "qualifier",
  qualifiers: "qualifier",
  qual: "qualifier",
  champs: "championship",
  champ: "championship",
  championships: "championship",
  states: "state",
  meet: "meet",
  scrim: "scrimmage",
  lt: "tournament",
  league: "league",
};

export function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((t) => t && !STOP.has(t) && !/^20\d\d$/.test(t)) // years are noise (playlists say 2025, events don't)
    .map((t) => ALIASES[t] ?? t);
}

/** Weighted Jaccard: numbers count double (they separate "Scrimmage 2" from "Scrimmage 3"). */
export function similarity(a: string[], b: string[]): number {
  const A = new Set(a);
  const B = new Set(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  let union = 0;
  const w = (t: string) => (/^\d+$/.test(t) ? 2 : 1);
  for (const t of new Set([...A, ...B])) {
    union += w(t);
    if (A.has(t) && B.has(t)) inter += w(t);
  }
  return inter / union;
}

export function resolveEvent(
  text: string,
  events: EventCandidate[],
  opts: { date?: string; extraText?: string } = {},
): Resolved | null {
  const upper = `${text} ${opts.extraText ?? ""}`.toUpperCase();
  const byCode = events.find((e) => new RegExp(`\\b${e.code}\\b`).test(upper));
  if (byCode) return { event: byCode, score: 1, margin: 1 };

  const tt = tokens(`${text} ${opts.extraText ?? ""}`);
  const when = opts.date ? Date.parse(opts.date.slice(0, 10)) : null;
  const scored = events
    .map((e) => {
      let s = similarity(tt, tokens(e.name));
      if (when != null && s > 0) {
        // Videos go up the day of, or within weeks after, the event. Mild boost near the event, mild
        // penalty for videos published before it started.
        const start = Date.parse(e.date_start.slice(0, 10));
        const days = (when - start) / 86_400_000;
        if (days < -1) s *= 0.6;
        else if (days <= 21) s *= 1.15;
        else if (days > 200) s *= 0.8;
      }
      return { event: e, score: Math.min(1, s) };
    })
    .sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best || best.score === 0) return null;
  return { event: best.event, score: best.score, margin: best.score - (scored[1]?.score ?? 0) };
}

/** Thresholds for auto-acceptance vs needing a human. */
export const confident = (r: Resolved | null) => !!r && r.score >= 0.6 && r.margin >= 0.15;
