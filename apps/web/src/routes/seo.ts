import { CURRENT_SEASON } from "@ftcref/seasons";
import { Hono } from "hono";
import { cached } from "../cache";
import { db, type Env } from "../env";
import { robotsTxt } from "../seoTags";

export const seoRoutes = new Hono<{ Bindings: Env }>();

/** Seasons listed in the sitemaps: the current one and the two before it. */
const SITEMAP_SEASONS = 3;
/** Protocol limit per sitemap file; the index below keeps events and teams in separate files. */
const MAX_URLS = 50_000;
const TTL = 3600;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const xml = (body: string) =>
  new Response(`<?xml version="1.0" encoding="UTF-8"?>\n${body}`, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });

const urlset = (urls: { loc: string; lastmod?: string }[]) =>
  xml(
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls
      .map((u) => `<url><loc>${esc(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ""}</url>`)
      .join("")}</urlset>`,
  );

// Cloudflare's managed robots.txt was comments only (no rules), so crawlers had the run of every host.
seoRoutes.get("/robots.txt", (c) =>
  c.text(robotsTxt(new URL(c.req.url).hostname), 200, { "Cache-Control": "public, max-age=3600" }),
);

seoRoutes.get("/sitemap.xml", (c) =>
  cached(c, { ttl: TTL }, async () => {
    const origin = new URL(c.req.url).origin;
    return xml(
      `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${["events", "teams"]
        .map((k) => `<sitemap><loc>${origin}/sitemap-${k}.xml</loc></sitemap>`)
        .join("")}</sitemapindex>`,
    );
  }),
);

seoRoutes.get("/sitemap-events.xml", (c) =>
  cached(c, { ttl: TTL }, async () => {
    const origin = new URL(c.req.url).origin;
    // Event pages stop changing once results are final, so the end date is an honest lastmod.
    // (`events.updated_at` is rewritten by every six-hourly sync, so it says nothing.)
    const today = new Date().toISOString().slice(0, 10);
    const { results } = await db(c)
      .prepare(
        "SELECT season, code, date_end FROM events WHERE published = 1 AND season > ? ORDER BY season DESC, date_start DESC, code LIMIT ?",
      )
      .bind(CURRENT_SEASON - SITEMAP_SEASONS, MAX_URLS)
      .all<{ season: number; code: string; date_end: string }>();
    return urlset(
      results.map((e) => {
        const end = e.date_end.slice(0, 10);
        return {
          loc: `${origin}/events/${e.season}/${encodeURIComponent(e.code)}`,
          lastmod: end < today ? end : today,
        };
      }),
    );
  }),
);

seoRoutes.get("/sitemap-teams.xml", (c) =>
  cached(c, { ttl: TTL }, async () => {
    const origin = new URL(c.req.url).origin;
    const { results } = await db(c)
      .prepare("SELECT DISTINCT number FROM team_seasons WHERE season > ? ORDER BY number LIMIT ?")
      .bind(CURRENT_SEASON - SITEMAP_SEASONS, MAX_URLS)
      .all<{ number: number }>();
    return urlset(results.map((t) => ({ loc: `${origin}/teams/${t.number}` })));
  }),
);
