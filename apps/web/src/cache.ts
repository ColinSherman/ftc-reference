import type { AppContext } from "./env";

/**
 * Edge HTML cache with version-keyed invalidation. The sync Worker bumps KV keys such as
 * `event:2026:USCAFFL1` after writing; the version becomes part of the cache key, so updated
 * data is served immediately without purge calls. Unversioned pages rely on a short TTL.
 *
 * Note: caches.default is a no-op on *.workers.dev — attach a custom domain for edge caching.
 */
export async function cached(
  c: AppContext,
  opts: { versions?: string[]; ttl: number },
  render: () => Promise<Response>,
): Promise<Response> {
  if (c.env.DEV === "1") return render();
  // Every page shows avatars, so the avatar-set version is always part of the key.
  const keys = ["avatars", ...(opts.versions ?? [])];
  const vers = await Promise.all(keys.map((k) => c.env.CACHE_VER.get(k, { cacheTtl: 60 })));
  const url = new URL(c.req.url);
  url.searchParams.set("__v", vers.map((v) => v ?? "0").join("."));
  url.searchParams.set("__d", c.env.CF_VERSION?.id ?? "dev");
  const key = new Request(url.toString(), { method: "GET" });
  const cache = caches.default;

  const hit = await cache.match(key);
  if (hit) return hit;

  const res = await render();
  if (res.status === 200) {
    res.headers.set("Cache-Control", `public, max-age=30, s-maxage=${opts.ttl}, stale-while-revalidate=300`);
    c.executionCtx.waitUntil(cache.put(key, res.clone()));
  }
  return res;
}

/** Versioned pages can live long at the edge; a data change produces a new key. */
export const VERSIONED_TTL = 86_400;
