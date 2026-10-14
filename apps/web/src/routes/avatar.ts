import { Hono } from "hono";
import type { Env } from "../env";

export const avatarRoutes = new Hono<{ Bindings: Env }>();

/**
 * /a/{team}-{key}.png — FIRST team avatars mirrored into D1. The key changes whenever the avatar
 * does, so responses are immutable: cached a year in browsers and at the edge after first hit.
 */
avatarRoutes.get("/:file{[0-9]+-[0-9a-f-]{8,64}.png}", async (c) => {
  const file = c.req.param("file");
  const key = file.slice(file.indexOf("-") + 1, -4);
  const cache = caches.default;
  const hit = await cache.match(c.req.raw);
  if (hit) return hit;

  const row = await c.env.DB.withSession("first-unconstrained")
    .prepare("SELECT png FROM avatar_images WHERE key = ?")
    .bind(key)
    .first<{ png: ArrayBuffer | number[] }>();
  if (!row) return c.body(null, 404, { "Cache-Control": "public, max-age=300" });

  const bytes = row.png instanceof ArrayBuffer ? new Uint8Array(row.png) : Uint8Array.from(row.png);
  const res = new Response(bytes, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
  c.executionCtx.waitUntil(cache.put(c.req.raw, res.clone()));
  return res;
});
