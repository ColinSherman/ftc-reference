// Shared by the staging scripts. Every write these scripts make goes to a staging resource; production
// is only ever read (exported). `assertStagingIsolated` is the guard: call it before any staging write.
import { execFileSync } from "node:child_process";
import { createReadStream, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const SYNC_DIR = join(ROOT, "apps/sync");
export const CONFIGS = [join(ROOT, "apps/sync/wrangler.jsonc"), join(ROOT, "apps/web/wrangler.jsonc")];

export const PROD_DB = "ftcref";
export const STAGE_DB = "ftcref-stage";
export const STAGE_KV = "ftcref-stage-cache";
export const STAGE_QUEUES = ["ftcref-stage-sync-jobs", "ftcref-stage-backfill", "ftcref-stage-dlq"];
export const PLACEHOLDER = { d1: "__STAGE_D1_ID__", kv: "__STAGE_KV_ID__" };

/** Run wrangler from apps/sync (its config carries both the production and staging bindings). */
export function wrangler(args, { quiet = false } = {}) {
  return execFileSync("npx", ["wrangler", ...args], {
    cwd: SYNC_DIR,
    encoding: "utf8",
    stdio: ["ignore", "pipe", quiet ? "pipe" : "inherit"],
    maxBuffer: 64 * 1024 * 1024,
  });
}

/** Parse wrangler's JSONC: drop comments outside strings, then trailing commas. */
export function readJsonc(path) {
  const src = readFileSync(path, "utf8");
  let out = "";
  let inStr = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inStr) {
      out += c;
      if (c === "\\") out += src[++i];
      else if (c === '"') inStr = false;
    } else if (c === '"') {
      inStr = true;
      out += c;
    } else if (c === "/" && src[i + 1] === "/") {
      while (i < src.length && src[i] !== "\n") i++;
      out += "\n";
    } else if (c === "/" && src[i + 1] === "*") {
      i = src.indexOf("*/", i + 2) + 1;
    } else out += c;
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"));
}

/** Every resource id a config binds, per environment ("" = production). */
export function boundIds(config) {
  const envs = { "": config, ...Object.fromEntries(Object.entries(config.env ?? {})) };
  return Object.fromEntries(
    Object.entries(envs).map(([name, e]) => [
      name,
      {
        d1: (e.d1_databases ?? []).map((d) => ({ name: d.database_name, id: d.database_id })),
        kv: (e.kv_namespaces ?? []).map((k) => k.id),
        queues: [
          ...(e.queues?.producers ?? []).map((q) => q.queue),
          ...(e.queues?.consumers ?? []).flatMap((q) => [q.queue, q.dead_letter_queue].filter(Boolean)),
        ],
      },
    ]),
  );
}

/** Throw unless every staging binding is a staging resource and none is shared with production. */
export function assertStagingIsolated() {
  for (const path of CONFIGS) {
    const ids = boundIds(readJsonc(path));
    const prod = ids[""];
    const stage = ids.staging;
    if (!stage) throw new Error(`${path}: no staging env`);
    const fail = (why) => {
      throw new Error(`${path}: staging is not isolated from production: ${why}`);
    };
    for (const d of stage.d1) {
      if (d.name !== STAGE_DB) fail(`D1 ${d.name} (staging must use ${STAGE_DB})`);
      if (prod.d1.some((p) => p.id === d.id || p.name === d.name))
        fail(`D1 ${d.name} is bound in production`);
    }
    for (const id of stage.kv) if (prod.kv.includes(id)) fail(`KV ${id} is bound in production`);
    for (const q of stage.queues) {
      if (!q.startsWith("ftcref-stage-")) fail(`queue ${q} (staging queues are ftcref-stage-*)`);
      if (prod.queues.includes(q)) fail(`queue ${q} is bound in production`);
    }
  }
}

/**
 * Split a `d1 export` dump into files of at most ~maxChars, each holding whole statements, so every
 * import request stays inside D1's per-request CPU limit (one 1 GB import gets the database reset).
 * Each file commits on its own. The dump's leading PRAGMAs are repeated at the top of every file, and
 * each CREATE INDEX gets a file to itself: indexing a big table is a request's worth of work alone.
 * Statements are made idempotent (INSERT OR IGNORE, IF NOT EXISTS; every table has a primary key) so
 * a file can be imported again after wrangler reports a failure for an import that in fact landed.
 * Streams the dump (it outgrows a JS string). Resolves to the file paths, in import order.
 */
export async function splitDump(dump, dir, maxChars) {
  const files = [];
  const prelude = [];
  let part = [];
  let size = 0;
  let stmt = [];
  let inStr = false;
  const flush = () => {
    if (!part.length) return;
    const file = join(dir, `part-${String(files.length).padStart(4, "0")}.sql`);
    writeFileSync(file, `${[...prelude, ...part].join("\n")}\n`);
    files.push(file);
    part = [];
    size = 0;
  };
  const lines = createInterface({ input: createReadStream(dump, "utf8"), crlfDelay: Infinity });
  for await (const line of lines) {
    stmt.push(line);
    // A statement ends at a line ending in `;` outside a string literal ('' escapes keep parity).
    for (let i = 0; i < line.length; i++) if (line.charCodeAt(i) === 39) inStr = !inStr;
    if (inStr || !line.trimEnd().endsWith(";")) continue;
    const sql = stmt
      .join("\n")
      .replace(/^INSERT INTO /, "INSERT OR IGNORE INTO ")
      .replace(/^CREATE TABLE (?!IF NOT EXISTS )/, "CREATE TABLE IF NOT EXISTS ")
      .replace(/^CREATE (UNIQUE )?INDEX (?!IF NOT EXISTS )/, "CREATE $1INDEX IF NOT EXISTS ");
    stmt = [];
    if (!files.length && !part.length && /^PRAGMA /i.test(sql)) {
      prelude.push(sql);
      continue;
    }
    const alone = /^CREATE (UNIQUE )?INDEX /i.test(sql);
    if (alone || size + sql.length > maxChars) flush();
    part.push(sql);
    size += sql.length + 1;
    if (alone) flush();
  }
  if (stmt.join("").trim()) throw new Error(`${dump}: ends mid-statement`);
  flush();
  return files;
}
