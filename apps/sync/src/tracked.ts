import { nowIso } from "@ftcref/db";
import type { FetchResult, FtcApi } from "@ftcref/ftc-api";
import type { Env } from "./env";

export interface Tracked<T> {
  result: FetchResult<T>;
  /** Persist sync_state. Call only after the data has been written, so a failed write is retried. */
  commit: () => D1PreparedStatement;
}

/**
 * Conditional GET keyed by path: replays the stored Last-Modified as If-Modified-Since,
 * archives every non-304 body to R2, and returns a deferred sync_state update.
 */
export async function trackedGet<T>(
  env: Env,
  api: FtcApi,
  season: number,
  path: string,
  force = false,
): Promise<Tracked<T>> {
  const key = `${season}/${path}`;
  const state = force
    ? null
    : await env.DB.prepare("SELECT last_modified FROM sync_state WHERE key = ?")
        .bind(key)
        .first<{ last_modified: string | null }>();
  const result = await api.get<T>(season, path, state?.last_modified);
  const now = nowIso();

  if (env.RAW && result.status === "ok" && result.body) await archive(env.RAW, key, result.body, now);

  const commit = () =>
    result.status === "not_modified"
      ? env.DB.prepare(
          "INSERT INTO sync_state (key, last_checked_at) VALUES (?1, ?2) " +
            "ON CONFLICT (key) DO UPDATE SET last_checked_at = ?2, fail_count = 0",
        ).bind(key, now)
      : env.DB.prepare(
          "INSERT INTO sync_state (key, last_modified, last_checked_at, last_changed_at) VALUES (?1, ?2, ?3, ?3) " +
            "ON CONFLICT (key) DO UPDATE SET last_modified = ?2, last_checked_at = ?3, last_changed_at = ?3, fail_count = 0",
        ).bind(key, result.lastModified, now);
  return { result, commit };
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
