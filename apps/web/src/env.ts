import type { Context } from "hono";

export interface Env {
  DB: D1Database;
  CACHE_VER: KVNamespace;
  CF_VERSION?: { id: string };
  /** "1" in local dev (.dev.vars) to bypass the edge HTML cache. */
  DEV?: string;
}

export type AppContext = Context<{ Bindings: Env }>;

/** Read through a D1 session so queries can be served by the nearest read replica. */
export const db = (c: AppContext) => c.env.DB.withSession("first-unconstrained");
export type Db = ReturnType<typeof db>;

export const SEASON = 2026;

/** URL slug for a match: q12 for quals, otherwise {level}{series}-{n} (e.g. p3-1, f1-2). */
export function matchSlug(level: string, series: number, n: number) {
  return level === "Q" ? `q${n}` : `${level.toLowerCase()}${series}-${n}`;
}

export function parseMatchSlug(slug: string): { level: string; series: number; n: number } | null {
  const q = /^q(\d+)$/i.exec(slug);
  if (q) return { level: "Q", series: 0, n: Number(q[1]) };
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
