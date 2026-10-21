#!/usr/bin/env node
// Re-sync events on staging with the code just deployed there, so a preview shows ingest changes.
// Events come from `stage-resync: 2026/KZASN1` lines (one or more, comma or space separated) in the
// PR body (env PR_BODY) and/or the RESYNC env var. Needs STAGE_SYNC_URL and STAGE_ADMIN_TOKEN.
// Waits for each job to finish on the staging Worker and prints its sync_runs row (staging D1, read via
// wrangler, so CLOUDFLARE_API_TOKEN too); exits non-zero if a job errored or never ran.
import { STAGE_DB, wrangler } from "./stage-lib.mjs";

const text = `${process.env.PR_BODY ?? ""}\n${process.env.RESYNC ? `stage-resync: ${process.env.RESYNC}` : ""}`;
const events = [
  ...new Set(
    [...text.matchAll(/^\s*stage-resync:\s*(.+)$/gim)].flatMap((m) =>
      m[1].split(/[\s,]+/).filter((e) => /^\d{4}\/[A-Za-z0-9]+$/.test(e)),
    ),
  ),
];
if (events.length === 0) {
  console.log("no stage-resync events requested");
  process.exit(0);
}
const { STAGE_SYNC_URL: base, STAGE_ADMIN_TOKEN: token } = process.env;
if (!base || !token) {
  console.log(
    `::warning::stage-resync requested (${events.join(" ")}) but STAGE_ADMIN_TOKEN is not set; skipped`,
  );
  process.exit(0);
}
const since = new Date().toISOString();
const pending = new Set();
for (const e of events) {
  const [season, code] = e.split("/");
  const res = await fetch(`${base}/admin/sync-event?season=${season}&code=${code}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  console.log(`${e}: ${res.status} ${await res.text()}`);
  if (res.ok) pending.add(`${season}/${code.toUpperCase()}`);
  else process.exitCode = 1;
}

const runsSince = () =>
  JSON.parse(
    wrangler(
      [
        "d1",
        "execute",
        STAGE_DB,
        "--remote",
        "--env",
        "staging",
        "--json",
        "--command",
        `SELECT target, requests, rows_written, ms, error FROM sync_runs
         WHERE job = 'eventMatches' AND started_at >= '${since}' ORDER BY started_at`,
      ],
      { quiet: true },
    ),
  )[0].results;

// Jobs retry on failure, so wait for a successful run; report every failed attempt along the way.
const deadline = Date.now() + 5 * 60_000;
let seen = 0;
while (pending.size && Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, 10_000));
  const runs = runsSince();
  for (const r of runs.slice(seen)) {
    if (!pending.has(r.target)) continue;
    console.log(
      `${r.target}: ${r.error ? `FAILED: ${r.error}` : "synced"} ` +
        `(${r.requests} API requests, ${r.rows_written} rows, ${r.ms} ms)`,
    );
    if (!r.error) pending.delete(r.target);
  }
  seen = runs.length;
}
for (const t of pending) {
  console.log(`::error::${t}: no successful sync run within 5 minutes`);
  process.exitCode = 1;
}
