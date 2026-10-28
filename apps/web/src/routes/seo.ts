import { ALL_SEASONS, CURRENT_SEASON, isSeason } from "@ftcref/seasons";
import { Hono } from "hono";
import { cached } from "../cache";
import { db, type Env } from "../env";
import { robotsTxt } from "../seoTags";

export const seoRoutes = new Hono<{ Bindings: Env }>();

/** Protocol limit per sitemap file. Events are split by season and stay well under it. */
const MAX_URLS = 50_000;
/** Finished seasons never change, so their files can live a week at the edge. */
const DAY = 86_400;
const ttlFor = (season: number) => (season === CURRENT_SEASON ? DAY : 7 * DAY);

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

/**
 * Sitemap index: hub pages, one events file per season (old ones never change, so crawlers can skip
 * them by lastmod), and teams. Match pages are left for crawlers to find from event pages.
 */
seoRoutes.get("/sitemap.xml", (c) =>
  cached(c, { ttl: DAY }, async () => {
    const origin = new URL(c.req.url).origin;
    const files = ["pages", ...ALL_SEASONS.map((y) => `events-${y}`), "teams"];
    return xml(
      `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${files
        .map((k) => `<sitemap><loc>${origin}/sitemap-${k}.xml</loc></sitemap>`)
        .join("")}</sitemapindex>`,
    );
  }),
);

seoRoutes.get("/sitemap-pages.xml", (c) =>
  cached(c, { ttl: DAY }, async () => {
    const origin = new URL(c.req.url).origin;
    const paths = ["/", "/seasons", ...ALL_SEASONS.flatMap((y) => [`/events/${y}`, `/seasons/${y}/leaders`])];
    return urlset(paths.map((p) => ({ loc: `${origin}${p}` })));
  }),
);

seoRoutes.get("/:file{sitemap-events-[0-9]{4}\\.xml}", (c) => {
  const season = Number(c.req.param("file").slice(15, 19));
  if (!isSeason(season)) return c.notFound();
  return cached(c, { ttl: ttlFor(season) }, async () => {
    const origin = new URL(c.req.url).origin;
    // Event pages stop changing once results are final, so the end date is an honest lastmod.
    // (`events.updated_at` is rewritten by every six-hourly sync, so it says nothing.)
    const today = new Date().toISOString().slice(0, 10);
    const { results } = await db(c)
      .prepare(
        "SELECT code, date_end FROM events WHERE season = ? AND published = 1 AND removed_at IS NULL ORDER BY date_start DESC, code LIMIT ?",
      )
      .bind(season, MAX_URLS)
      .all<{ code: string; date_end: string }>();
    return urlset(
      results.map((e) => {
        const end = e.date_end.slice(0, 10);
        return {
          loc: `${origin}/events/${season}/${encodeURIComponent(e.code)}`,
          lastmod: end < today ? end : today,
        };
      }),
    );
  });
});

seoRoutes.get("/sitemap-teams.xml", (c) =>
  cached(c, { ttl: DAY }, async () => {
    const origin = new URL(c.req.url).origin;
    // Every team registered since 2019; the teams table is keyed by number, so this is one ordered walk.
    const { results } = await db(c)
      .prepare("SELECT number FROM teams ORDER BY number LIMIT ?")
      .bind(MAX_URLS)
      .all<{ number: number }>();
    return urlset(results.map((t) => ({ loc: `${origin}/teams/${t.number}` })));
  }),
);
