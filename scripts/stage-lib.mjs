// Shared by the staging scripts. Every write these scripts make goes to a staging resource; production
// is only ever read (exported). `assertStagingIsolated` is the guard: call it before any staging write.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const SYNC_DIR = join(ROOT, "apps/sync");
export const CONFIGS = ["sync", "web", "account"].map((app) => join(ROOT, "apps", app, "wrangler.jsonc"));

export const PROD_DB = "ftcref";
export const STAGE_DB = "ftcref-stage";
/** Accounts (apps/account). Never a copy of production: stage-seed only touches STAGE_DB. */
export const STAGE_AUTH_DB = "ftcref-stage-auth";
export const STAGE_D1S = [STAGE_DB, STAGE_AUTH_DB];
export const STAGE_KV = "ftcref-stage-cache";
export const STAGE_QUEUES = ["ftcref-stage-sync-jobs", "ftcref-stage-backfill", "ftcref-stage-dlq"];
/** Placeholder ids stage-resources fills in. D1 placeholders are per database name. */
export const PLACEHOLDER = {
  d1: { [STAGE_DB]: "__STAGE_D1_ID__", [STAGE_AUTH_DB]: "__STAGE_AUTH_D1_ID__" },
  kv: "__STAGE_KV_ID__",
};

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
        services: (e.services ?? []).map((s) => s.service),
        ratelimits: (e.ratelimits ?? []).map((r) => String(r.namespace_id)),
      },
    ]),
  );
}

/** Throw unless every staging binding is a staging resource and none is shared with production. */
export function assertStagingIsolated() {
  for (const path of CONFIGS) checkIsolated(readJsonc(path), path);
}

/** One config's check (see assertStagingIsolated). */
export function checkIsolated(config, path) {
  const ids = boundIds(config);
  const prod = ids[""];
  const stage = ids.staging;
  if (!stage) throw new Error(`${path}: no staging env`);
  const fail = (why) => {
    throw new Error(`${path}: staging is not isolated from production: ${why}`);
  };
  for (const d of stage.d1) {
    if (!STAGE_D1S.includes(d.name)) fail(`D1 ${d.name} (staging must use one of ${STAGE_D1S.join(", ")})`);
    if (prod.d1.some((p) => p.id === d.id || p.name === d.name)) fail(`D1 ${d.name} is bound in production`);
  }
  for (const id of stage.kv) if (prod.kv.includes(id)) fail(`KV ${id} is bound in production`);
  for (const q of stage.queues) {
    if (!q.startsWith("ftcref-stage-")) fail(`queue ${q} (staging queues are ftcref-stage-*)`);
    if (prod.queues.includes(q)) fail(`queue ${q} is bound in production`);
  }
  // Service bindings reach another Worker, and with it that Worker's data.
  for (const s of stage.services) {
    if (!s.endsWith("-stage")) fail(`service ${s} (staging Workers are *-stage)`);
    if (prod.services.includes(s)) fail(`service ${s} is bound in production`);
  }
  for (const r of stage.ratelimits)
    if (prod.ratelimits.includes(r)) fail(`rate limit namespace ${r} is shared with production`);
}
