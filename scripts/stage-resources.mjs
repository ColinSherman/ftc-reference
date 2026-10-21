#!/usr/bin/env node
// Make sure the staging D1, KV namespace and queues exist, and that both wrangler.jsonc files point at
// them. Idempotent: run before every staging deploy (CI does). Needs CLOUDFLARE_API_TOKEN.
//
// The committed configs may still hold the __STAGE_*_ID__ placeholders; this fills them in the working
// tree and prints the ids so they can be committed. A committed id that doesn't match is an error.
import { readFileSync, writeFileSync } from "node:fs";
import {
  assertStagingIsolated,
  boundIds,
  CONFIGS,
  PLACEHOLDER,
  readJsonc,
  STAGE_DB,
  STAGE_KV,
  STAGE_QUEUES,
  wrangler,
} from "./stage-lib.mjs";

function d1Id() {
  const find = () =>
    JSON.parse(wrangler(["d1", "list", "--json"], { quiet: true })).find((d) => d.name === STAGE_DB);
  let db = find();
  if (!db) {
    console.log(`creating D1 ${STAGE_DB}`);
    wrangler(["d1", "create", STAGE_DB]);
    db = find();
  }
  if (!db) throw new Error(`D1 ${STAGE_DB} not found after create`);
  return db.uuid;
}

function kvId() {
  const find = () =>
    JSON.parse(wrangler(["kv", "namespace", "list"], { quiet: true })).find(
      (n) => n.title === STAGE_KV || n.title.endsWith(`-${STAGE_KV}`),
    );
  let ns = find();
  if (!ns) {
    console.log(`creating KV namespace ${STAGE_KV}`);
    wrangler(["kv", "namespace", "create", STAGE_KV]);
    ns = find();
  }
  if (!ns) throw new Error(`KV ${STAGE_KV} not found after create`);
  return ns.id;
}

function ensureQueues() {
  for (const q of STAGE_QUEUES) {
    try {
      wrangler(["queues", "info", q], { quiet: true });
    } catch {
      console.log(`creating queue ${q}`);
      wrangler(["queues", "create", q]);
    }
  }
}

const ids = { d1: d1Id(), kv: kvId() };
ensureQueues();

let filled = false;
for (const path of CONFIGS) {
  const stage = boundIds(readJsonc(path)).staging;
  for (const [kind, bound] of [
    ["d1", stage.d1.map((d) => d.id)],
    ["kv", stage.kv],
  ]) {
    for (const id of bound) {
      if (id === PLACEHOLDER[kind]) continue;
      if (id !== ids[kind])
        throw new Error(`${path}: staging ${kind} id ${id} is not ${STAGE_DB}/${STAGE_KV} (${ids[kind]})`);
    }
  }
  const src = readFileSync(path, "utf8");
  const next = src.replaceAll(PLACEHOLDER.d1, ids.d1).replaceAll(PLACEHOLDER.kv, ids.kv);
  if (next !== src) {
    writeFileSync(path, next);
    filled = true;
  }
}

assertStagingIsolated();
console.log(`staging D1 ${STAGE_DB} = ${ids.d1}`);
console.log(`staging KV ${STAGE_KV} = ${ids.kv}`);
if (filled)
  console.log(`Filled placeholders in the working tree. Commit these ids into ${CONFIGS.join(" and ")}.`);
