#!/usr/bin/env node
// Replace the staging D1 with a copy of production, then apply this checkout's migrations on top.
// Production is only exported (read); every write targets ftcref-stage. Needs CLOUDFLARE_API_TOKEN.
// Accounts are in their own D1s (ftcref-auth / ftcref-stage-auth), which this never reads or copies:
// production users and sessions stay out of staging.
//
//   node scripts/stage-seed.mjs             copy now (wipes staging)
//   node scripts/stage-seed.mjs --if-empty  copy only when staging has no events yet (CI uses this)
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertStagingIsolated, PROD_DB, STAGE_DB, wrangler } from "./stage-lib.mjs";

assertStagingIsolated();
const stage = (args, opts) => wrangler([...args, "--env", "staging"], opts);
const stageQuery = (sql) =>
  JSON.parse(stage(["d1", "execute", STAGE_DB, "--remote", "--json", "--command", sql], { quiet: true }))[0]
    .results;

if (process.argv.includes("--if-empty")) {
  const hasEvents =
    stageQuery("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'events'").length > 0;
  const n = hasEvents ? Number(stageQuery("SELECT COUNT(*) AS n FROM events")[0]?.n ?? 0) : 0;
  if (n > 0) {
    console.log(`staging already has ${n} events; not seeding (run without --if-empty to refresh)`);
    process.exit(0);
  }
}

const dir = mkdtempSync(join(tmpdir(), "ftcref-seed-"));
const dump = join(dir, "prod.sql");
console.log(`exporting ${PROD_DB} (production, read-only)`);
wrangler(["d1", "export", PROD_DB, "--remote", "--output", dump]);

// Drop every staging table (the dump recreates them, d1_migrations included).
const tables = stageQuery(
  "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'",
).map((r) => r.name);
if (tables.length) {
  const reset = join(dir, "reset.sql");
  writeFileSync(
    reset,
    [
      "PRAGMA defer_foreign_keys = on;",
      ...tables.map((t) => `DROP TABLE IF EXISTS "${t.replaceAll('"', '""')}";`),
    ].join("\n"),
  );
  console.log(`dropping ${tables.length} staging tables`);
  stage(["d1", "execute", STAGE_DB, "--remote", "--yes", "--file", reset]);
}

console.log(`importing into ${STAGE_DB}`);
stage(["d1", "execute", STAGE_DB, "--remote", "--yes", "--file", dump]);

// Migrations this branch adds on top of production's schema.
stage(["d1", "migrations", "apply", STAGE_DB, "--remote"]);
console.log("staging seeded from production");
