/** Pacific date (YouTube quota resets at midnight America/Los_Angeles). */
export const pacificDay = (d = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(d);

/**
 * Record external API usage for the admin dashboard. Every YouTube Data API call we make costs
 * 1 unit (we never call search.list), so units == calls.
 */
export async function recordApiUsage(
  db: Pick<D1Database, "prepare">,
  api: "youtube" | "youtube_rss",
  calls: number,
  error?: unknown,
) {
  if (!calls && !error) return;
  const now = new Date().toISOString();
  const msg = error ? (error instanceof Error ? error.message : String(error)).slice(0, 300) : null;
  await db
    .prepare(
      `INSERT INTO api_usage (day, api, units, calls, errors, last_error, last_error_at, last_ok_at)
       VALUES (?1, ?2, ?3, ?3, ?4, ?5, CASE WHEN ?5 IS NULL THEN NULL ELSE ?6 END, CASE WHEN ?5 IS NULL THEN ?6 ELSE NULL END)
       ON CONFLICT (day, api) DO UPDATE SET
         units = units + ?3, calls = calls + ?3, errors = errors + ?4,
         last_error = COALESCE(?5, last_error),
         last_error_at = CASE WHEN ?5 IS NULL THEN last_error_at ELSE ?6 END,
         last_ok_at = CASE WHEN ?5 IS NULL THEN ?6 ELSE last_ok_at END`,
    )
    .bind(pacificDay(), api, calls, error ? 1 : 0, msg, now)
    .run();
}
