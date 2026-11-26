import { nowIso } from "@ftcref/db";
import { type FetchResult, type FtcApi, FtcApiError } from "@ftcref/ftc-api";
import type { Env } from "./env";

export interface Tracked<T> {
  result: FetchResult<T>;
  /** Persist sync_state. Call only after the data has been written, so a failed write is retried. */
  commit: () => D1PreparedStatement;
}

/**
 * Conditional GET keyed by path: replays the stored Last-Modified as If-Modified-Since, archives
 * every changed body to R2, and returns a deferred sync_state update.
 *
 * A 200 whose body hashes the same as the last stored one counts as not modified: some endpoints
 * send no Last-Modified (so never 304), and treating each of their polls as a change kept events on
 * the every-minute cadence with every endpoint re-fetched and re-written. `force` skips the check.
 */
export async function trackedGet<T>(
  env: Env,
  api: FtcApi,
  season: number,
  path: string,
  force = false,
  opts: { soft?: boolean } = {},
): Promise<Tracked<T>> {
  const key = `${season}/${path}`;
  const state = force
    ? null
    : await env.DB.prepare("SELECT last_modified, body_hash FROM sync_state WHERE key = ?")
        .bind(key)
        .first<{ last_modified: string | null; body_hash: string | null }>();
  let result: FetchResult<T>;
  try {
    result = await api.get<T>(season, path, state?.last_modified);
  } catch (e) {
    // Soft endpoints: FIRST occasionally answers 403/404/5xx for one event's scores or rankings
    // (seen on some 2020–21 remote events). Treat that as "no data" so the rest of the event still syncs.
    if (!opts.soft || !(e instanceof FtcApiError) || e.httpStatus === 401 || e.httpStatus === 429) throw e;
    console.warn(`soft-fail ${key}: ${e.httpStatus}`);
    return {
      result: { status: "ok", data: null, lastModified: null, body: "" },
      commit: () =>
        env.DB.prepare(
          "INSERT INTO sync_state (key, last_checked_at, fail_count) VALUES (?1, ?2, 1) " +
            "ON CONFLICT (key) DO UPDATE SET last_checked_at = ?2, fail_count = fail_count + 1",
        ).bind(key, nowIso()),
    };
  }
  const now = nowIso();
  const hash = result.status === "ok" ? await bodyHash(result.body) : null;
  if (result.status === "ok" && hash != null && hash === state?.body_hash) {
    // Same content as last time. Keep a newer Last-Modified, if one came, so the next poll can 304.
    const lastModified = result.lastModified;
    return {
      result: { status: "not_modified" },
      commit: () =>
        env.DB.prepare(
          "INSERT INTO sync_state (key, last_modified, last_checked_at) VALUES (?1, ?2, ?3) " +
            "ON CONFLICT (key) DO UPDATE SET last_modified = COALESCE(?2, last_modified), last_checked_at = ?3, fail_count = 0",
        ).bind(key, lastModified, now),
    };
  }

  if (env.RAW && result.status === "ok" && result.body) await archive(env.RAW, key, result.body, now);

  const commit = () =>
    result.status === "not_modified"
      ? env.DB.prepare(
          "INSERT INTO sync_state (key, last_checked_at) VALUES (?1, ?2) " +
            "ON CONFLICT (key) DO UPDATE SET last_checked_at = ?2, fail_count = 0",
        ).bind(key, now)
      : env.DB.prepare(
          "INSERT INTO sync_state (key, last_modified, last_checked_at, last_changed_at, body_hash) VALUES (?1, ?2, ?3, ?3, ?4) " +
            "ON CONFLICT (key) DO UPDATE SET last_modified = ?2, last_checked_at = ?3, last_changed_at = ?3, fail_count = 0, body_hash = ?4",
        ).bind(key, result.lastModified, now, hash);
  return { result, commit };
}

/** Short content hash (128 bits of SHA-256, hex); null for an empty body. */
export async function bodyHash(body: string): Promise<string | null> {
  if (!body) return null;
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body));
  return [...new Uint8Array(d, 0, 16)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function archive(bucket: R2Bucket, key: string, body: string, now: string) {
  const gz = new Response(new Blob([body]).stream().pipeThrough(new CompressionStream("gzip")));
  const safe = key.replace(/[?&=]/g, "_");
  await bucket.put(`raw/${safe}/${now.replace(/[:.]/g, "-")}.json.gz`, await gz.arrayBuffer(), {
    httpMetadata: { contentType: "application/json", contentEncoding: "gzip" },
  });
}

export const dataOf = <T>(t: Tracked<T>): T | null => (t.result.status === "ok" ? t.result.data : null);
export const changed = (t: Tracked<unknown>) => t.result.status === "ok";
