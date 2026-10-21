#!/usr/bin/env node
// Re-sync events on staging with the code just deployed there, so a preview shows ingest changes.
// Events come from `stage-resync: 2026/KZASN1` lines (one or more, comma or space separated) in the
// PR body (env PR_BODY) and/or the RESYNC env var. Needs STAGE_SYNC_URL and STAGE_ADMIN_TOKEN.
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
for (const e of events) {
  const [season, code] = e.split("/");
  const res = await fetch(`${base}/admin/sync-event?season=${season}&code=${code}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  console.log(`${e}: ${res.status} ${await res.text()}`);
  if (!res.ok) process.exitCode = 1;
}
