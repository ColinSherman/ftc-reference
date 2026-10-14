/**
 * Parse match references out of free-form YouTube titles. There is no standard for FTC match video
 * titles, so this accepts the common shapes seen in the wild:
 *   "… - Q22", "Qual 12", "Qualification Match 12", "QM12", "Q-12", "Match 12"
 *   "Playoff 3", "Playoff Match 3", "P3", "M-3" (double-elim series), "Upper Bracket R2 M3" → series 3
 *   "SF1-2", "Semifinal 1 Match 2", "Semi 2-1", "F1", "Final 2", "Finals Match 1"
 *   test/practice matches ("T-1", "Test Match", "Practice 1") are recognised and skipped.
 */
export interface MatchRef {
  level: "Q" | "P" | "SF" | "F";
  series: number;
  number: number;
}

export type ParsedTitle =
  | { kind: "match"; ref: MatchRef; eventText: string; seconds?: number }
  | { kind: "test"; eventText: string }
  | { kind: "none"; eventText: string };

const NUM = String.raw`(\d{1,3})`;

/** Ordered: the first pattern that matches wins. Each returns the match reference + the matched span. */
const PATTERNS: [RegExp, (m: RegExpExecArray) => MatchRef | "test"][] = [
  // Test / practice matches
  [/\b(?:t-?\d+|test(?:\s+match)?(?:\s*\d+)?|practice(?:\s+match)?(?:\s*\d+)?)\b/i, () => "test"],
  // Semifinal a-b / SF a-b / Semi a Match b
  [
    new RegExp(String.raw`\b(?:sf|semi(?:-?finals?)?)\s*-?\s*${NUM}\s*(?:-|\.|m|match)\s*${NUM}\b`, "i"),
    (m) => ({ level: "SF", series: Number(m[1]), number: Number(m[2]) }),
  ],
  // Finals: "F1", "F-2", "Final 2", "Finals Match 1", "Final Match 1-2"
  [
    new RegExp(String.raw`\b(?:f|finals?)\s*(?:match\s*)?-?\s*(?:1\s*-\s*)?${NUM}\b`, "i"),
    (m) => ({ level: "F", series: 1, number: Number(m[1]) }),
  ],
  // Double-elimination playoffs: "Playoff 3", "Playoff Match 3", "P3", "M-3", "Match M3"
  [
    new RegExp(String.raw`\b(?:playoffs?(?:\s+match)?|p|m)\s*-?\s*${NUM}\b`, "i"),
    (m) => ({ level: "P", series: Number(m[1]), number: 1 }),
  ],
  // Qualifications: "Q22", "QM 12", "Q-12", "Qual 12", "Quals Match 12", "Qualification Match 12", "Qualifier 3"
  [
    new RegExp(
      String.raw`\b(?:qm|q|quals?|qualifications?|qualifiers?)\s*(?:match\s*)?-?\s*#?\s*${NUM}\b`,
      "i",
    ),
    (m) => ({ level: "Q", series: 0, number: Number(m[1]) }),
  ],
  // Bare "Match 12" (assumed qualification)
  [
    new RegExp(String.raw`\bmatch\s*#?\s*${NUM}\b`, "i"),
    (m) => ({ level: "Q", series: 0, number: Number(m[1]) }),
  ],
];

export function parseTitle(title: string): ParsedTitle {
  for (const [re, f] of PATTERNS) {
    const m = re.exec(title);
    if (!m) continue;
    const eventText = cleanEventText(`${title.slice(0, m.index)} ${title.slice(m.index + m[0].length)}`);
    const r = f(m);
    if (r === "test") return { kind: "test", eventText };
    return { kind: "match", ref: r, eventText };
  }
  return { kind: "none", eventText: cleanEventText(title) };
}

/** Strip separators and filler so what remains can be compared against event names. */
export function cleanEventText(s: string) {
  return s
    .replace(/[|•·–—_]+/g, " ")
    .replace(/\s-\s/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Parse a YouTube URL or bare ID, with optional t=/start= offset ("1h2m3s", "754"). */
export function parseYoutubeUrl(input: string): { id: string; start?: number } | null {
  const s = input.trim();
  if (/^[\w-]{11}$/.test(s)) return { id: s };
  let u: URL;
  try {
    u = new URL(s.startsWith("http") ? s : `https://${s}`);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\.|^m\./, "");
  let id: string | null = null;
  if (host === "youtu.be") id = u.pathname.slice(1, 12);
  else if (host.endsWith("youtube.com") || host.endsWith("youtube-nocookie.com")) {
    id = u.searchParams.get("v") ?? /^\/(?:embed|shorts|live|v)\/([\w-]{11})/.exec(u.pathname)?.[1] ?? null;
  }
  if (!id || !/^[\w-]{11}$/.test(id)) return null;
  const t = u.searchParams.get("t") ?? u.searchParams.get("start") ?? /t=([\dhms]+)/.exec(u.hash)?.[1];
  const start = t ? timeToSeconds(t) : undefined;
  return start ? { id, start } : { id };
}

export function timeToSeconds(t: string): number | undefined {
  if (/^\d+$/.test(t)) return Number(t);
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(t);
  if (!m || (!m[1] && !m[2] && !m[3])) return undefined;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

/** Playlist (`list=`) or channel (`/channel/UC…`, `/@handle`) reference from a URL. */
export function parseYoutubeSource(
  input: string,
):
  | { kind: "playlist"; id: string }
  | { kind: "channel"; id: string }
  | { kind: "handle"; handle: string }
  | null {
  let u: URL;
  try {
    u = new URL(input.trim().startsWith("http") ? input.trim() : `https://${input.trim()}`);
  } catch {
    return null;
  }
  const list = u.searchParams.get("list");
  if (list) return { kind: "playlist", id: list };
  const ch = /^\/channel\/(UC[\w-]{22})/.exec(u.pathname);
  if (ch) return { kind: "channel", id: ch[1] as string };
  const h = /^\/@([\w.-]+)/.exec(u.pathname);
  if (h) return { kind: "handle", handle: h[1] as string };
  return null;
}
