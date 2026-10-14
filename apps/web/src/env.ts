import { CURRENT_SEASON, isSeason } from "@ftcref/seasons";
import type { Context } from "hono";

export interface Env {
  DB: D1Database;
  CACHE_VER: KVNamespace;
  CF_VERSION?: { id: string };
  /** Admin session secret (video review). */
  ADMIN_TOKEN?: string;
  /** YouTube Data API key (video imports). */
  YOUTUBE_API_KEY?: string;
  /** "1" in local dev (.dev.vars) to bypass the edge HTML cache. */
  DEV?: string;
}

export type AppContext = Context<{ Bindings: Env }>;

/** Read through a D1 session so queries can be served by the nearest read replica. */
export const db = (c: AppContext) => c.env.DB.withSession("first-unconstrained");
export type Db = ReturnType<typeof db>;

export { CURRENT_SEASON as SEASON } from "@ftcref/seasons";

/** Season from a route param / query value, falling back to the current season. */
export const parseSeason = (v: string | null | undefined) => {
  const n = Number(v);
  return Number.isInteger(n) && isSeason(n) ? n : CURRENT_SEASON;
};

/** URL slug for a match: q12 for quals, otherwise {level}{series}-{n} (e.g. p3-1, f1-2). */
export function matchSlug(level: string, series: number, n: number) {
  // Remote events store the team number in `series` for quals: q3t12345.
  if (level === "Q") return series ? `q${n}t${series}` : `q${n}`;
  return `${level.toLowerCase()}${series}-${n}`;
}

export function parseMatchSlug(slug: string): { level: string; series: number; n: number } | null {
  const q = /^q(\d+)(?:t(\d+))?$/i.exec(slug);
  if (q) return { level: "Q", series: Number(q[2] ?? 0), n: Number(q[1]) };
  const o = /^(p|sf|f|o)(\d+)-(\d+)$/i.exec(slug);
  if (o) return { level: (o[1] as string).toUpperCase(), series: Number(o[2]), n: Number(o[3]) };
  return null;
}

export const matchLabel = (level: string, series: number, n: number) =>
  level === "Q"
    ? `Q${n}`
    : level === "P"
      ? `Playoff ${series}${n > 1 ? `-${n}` : ""}`
      : `${level}${series}-${n}`;
