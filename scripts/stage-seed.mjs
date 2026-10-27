#!/usr/bin/env node
// Replace the staging D1 with a copy of production, then apply this checkout's migrations on top.
// Production is only exported (read); every write targets ftcref-stage. Needs CLOUDFLARE_API_TOKEN.
//
//   node scripts/stage-seed.mjs             copy now (wipes staging)
//   node scripts/stage-seed.mjs --if-empty  copy only when staging has no events yet (CI uses this)
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertStagingIsolated, PROD_DB, STAGE_DB, splitDump, wrangler } from "./stage-lib.mjs";

// ~25 MB of SQL per import request: about 1 s of SQLite work locally, well inside D1's limit.
const CHUNK_CHARS = 25_000_000;

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

// Drop every staging table (the dump recreates them, d1_migrations included), one per request so no
// single request outruns D1's CPU limit. Tables holding foreign keys go first: dropping `matches`
// while its ON DELETE CASCADE children still exist deletes their rows one by one, which alone is
// enough to get the database reset.
const tables = stageQuery(
  `SELECT m.name FROM sqlite_master m
   WHERE m.type = 'table' AND m.name NOT LIKE 'sqlite_%' AND m.name NOT LIKE '_cf_%'
   ORDER BY (SELECT COUNT(*) FROM pragma_foreign_key_list(m.name)) > 0 DESC`,
).map((r) => r.name);
console.log(`dropping ${tables.length} staging tables`);
for (const t of tables) stageQuery(`DROP TABLE IF EXISTS "${t.replaceAll('"', '""')}"`);

// Import in pieces of whole statements; the dump in one request exceeds D1's CPU limit. A failure
// part-way leaves staging half-filled: rerun, the reset above clears it.
const parts = await splitDump(dump, dir, CHUNK_CHARS);
for (const [i, part] of parts.entries()) {
  console.log(`importing into ${STAGE_DB}: part ${i + 1}/${parts.length}`);
  stage(["d1", "execute", STAGE_DB, "--remote", "--yes", "--file", part]);
}

// Migrations this branch adds on top of production's schema.
stage(["d1", "migrations", "apply", STAGE_DB, "--remote"]);
console.log("staging seeded from production");
