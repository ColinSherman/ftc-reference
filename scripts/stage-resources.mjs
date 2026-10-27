#!/usr/bin/env node
// Make sure the staging D1s, KV namespace and queues exist, and that every wrangler.jsonc points at
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
  STAGE_D1S,
  STAGE_KV,
  STAGE_QUEUES,
  wrangler,
} from "./stage-lib.mjs";

function d1Id(name) {
  const find = () =>
    JSON.parse(wrangler(["d1", "list", "--json"], { quiet: true })).find((d) => d.name === name);
  let db = find();
  if (!db) {
    console.log(`creating D1 ${name}`);
    wrangler(["d1", "create", name]);
    db = find();
  }
  if (!db) throw new Error(`D1 ${name} not found after create`);
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

const d1 = Object.fromEntries(STAGE_D1S.map((name) => [name, d1Id(name)]));
const kv = kvId();
ensureQueues();

let filled = false;
for (const path of CONFIGS) {
  const stage = boundIds(readJsonc(path)).staging;
  for (const { name, id } of stage.d1) {
    if (id === PLACEHOLDER.d1[name]) continue;
    if (id !== d1[name]) throw new Error(`${path}: staging D1 ${name} id ${id} is not ${d1[name]}`);
  }
  for (const id of stage.kv) {
    if (id === PLACEHOLDER.kv) continue;
    if (id !== kv) throw new Error(`${path}: staging KV id ${id} is not ${STAGE_KV} (${kv})`);
  }
  const src = readFileSync(path, "utf8");
  let next = src.replaceAll(PLACEHOLDER.kv, kv);
  for (const name of STAGE_D1S) next = next.replaceAll(PLACEHOLDER.d1[name], d1[name]);
  if (next !== src) {
    writeFileSync(path, next);
    filled = true;
  }
}

assertStagingIsolated();
for (const name of STAGE_D1S) console.log(`staging D1 ${name} = ${d1[name]}`);
console.log(`staging KV ${STAGE_KV} = ${kv}`);
if (filled)
  console.log(`Filled placeholders in the working tree. Commit these ids into ${CONFIGS.join(", ")}.`);
