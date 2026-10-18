// Fill avatar gaps with teams' Instagram profile photos. FIRST avatars always win; this only writes
// teams with no FIRST avatar, as team_avatars rows with cmp_year = 0 (lower than any FIRST year, so a
// later FIRST avatar replaces it through the normal sync).
//
// Instagram refuses unauthenticated requests from Cloudflare's network, so this runs from your own
// machine and writes to D1 through wrangler (your login, the account pinned in apps/sync).
//
// Handles come from FIRST's team `website` field when it is an instagram.com profile, plus
// scripts/instagram-handles.json ({ "34730": "sipi6_ftc" }; a null value suppresses a team).
//
// Usage: node scripts/instagram-avatars.mjs [--dry-run] [--only=34730,9626] [--delay=2000]
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SYNC_DIR = join(ROOT, "apps", "sync");
const HANDLES_FILE = join(ROOT, "scripts", "instagram-handles.json");
const UA = "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)";
const MAX_BYTES = 48 * 1024; // profile photos are ~4 KB 100×100 JPEGs; keeps each INSERT well under D1's limit
// Paths under instagram.com that aren't profiles.
const RESERVED = new Set(["p", "reel", "reels", "tv", "stories", "explore", "accounts", "direct", "share"]);

/** Instagram username from a profile URL (or a bare handle / @handle), else null. */
export function parseInstagramHandle(input) {
  if (!input) return null;
  const s = String(input).trim();
  if (/^@?[A-Za-z0-9._]{1,30}$/.test(s) && !s.includes("/")) return s.replace(/^@/, "").toLowerCase();
  let u;
  try {
    u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return null;
  }
  if (!/^(www\.|m\.)?instagram\.com$/i.test(u.hostname)) return null;
  const first = u.pathname.split("/").filter(Boolean)[0];
  if (!first || RESERVED.has(first.toLowerCase()) || !/^[A-Za-z0-9._]{1,30}$/.test(first)) return null;
  return first.toLowerCase();
}

/** Profile photo URL from a profile page's og:image tag, else null. */
export function parseProfilePic(html) {
  const m = html.match(/<meta property="og:image" content="([^"]+)"/);
  return m ? (m[1] ?? "").replaceAll("&amp;", "&") : null;
}

// Run wrangler's JS entry with node directly: no shell, so SQL arguments stay intact on Windows.
const WRANGLER_PKG = createRequire(import.meta.url).resolve("wrangler/package.json");
const WRANGLER = join(dirname(WRANGLER_PKG), JSON.parse(readFileSync(WRANGLER_PKG, "utf8")).bin.wrangler);

function wrangler(args) {
  // wrangler on Windows can trip a libuv assertion on exit after printing its output; trust stdout.
  try {
    return execFileSync(process.execPath, [WRANGLER, ...args], {
      cwd: SYNC_DIR,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (e) {
    if (e.stdout?.trim().startsWith("[")) return e.stdout;
    throw new Error(`wrangler ${args.join(" ")} failed:\n${e.stderr || e.message}`);
  }
}

function query(sql) {
  const out = wrangler(["d1", "execute", "ftcref", "--remote", "--json", "--command", sql]);
  return JSON.parse(out.slice(out.indexOf("[")))[0].results;
}

const sqlStr = (s) => `'${String(s).replaceAll("'", "''")}'`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchPhoto(handle) {
  const page = await fetch(`https://www.instagram.com/${handle}/`, { headers: { "user-agent": UA } });
  if (page.status === 429 || /\/accounts\/login/.test(page.url)) return { blocked: true };
  if (page.status === 404) return { error: "no such account" };
  if (!page.ok) return { error: `profile ${page.status}` };
  const pic = parseProfilePic(await page.text());
  if (!pic) return { error: "no og:image (private or removed?)" };
  const img = await fetch(pic);
  if (!img.ok) return { error: `image ${img.status}` };
  const bytes = Buffer.from(await img.arrayBuffer());
  if (bytes.length > MAX_BYTES) return { error: `image too large (${bytes.length} B)` };
  if (!(bytes[0] === 0xff && bytes[1] === 0xd8)) return { error: "not a JPEG" };
  return { bytes };
}

async function main() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((a) => {
      const [k, v] = a.replace(/^--/, "").split("=");
      return [k, v ?? true];
    }),
  );
  const dry = Boolean(args["dry-run"]);
  const delay = Number(args.delay ?? 2000);
  const only = args.only ? new Set(String(args.only).split(",").map(Number)) : null;

  const manual = JSON.parse(readFileSync(HANDLES_FILE, "utf8"));
  const sites = query("SELECT number, website FROM teams WHERE website LIKE '%instagram.com%'");
  const avatars = query("SELECT team, cmp_year, key FROM team_avatars");
  const first = new Set(avatars.filter((r) => r.cmp_year > 0).map((r) => r.team));
  const ig = new Map(avatars.filter((r) => r.cmp_year === 0).map((r) => [r.team, r.key]));

  /** team → handle, manual entries overriding the FIRST website field. */
  const handles = new Map();
  for (const r of sites) {
    const h = parseInstagramHandle(r.website);
    if (h) handles.set(r.number, h);
  }
  for (const [team, h] of Object.entries(manual)) {
    if (team.startsWith("_")) continue; // comment keys
    const parsed = h === null ? null : parseInstagramHandle(h);
    if (h !== null && !parsed) console.warn(`manual entry ${team}: can't read handle "${h}"`);
    if (parsed) handles.set(Number(team), parsed);
    else handles.delete(Number(team));
  }

  const todo = [...handles].filter(([t]) => !first.has(t) && (!only || only.has(t)));
  console.log(`${handles.size} handles; ${todo.length} teams without a FIRST avatar to fetch`);

  const stmts = [];
  const now = new Date().toISOString();
  let ok = 0;
  let same = 0;
  let writes = 0;
  for (const [i, [team, handle]] of todo.entries()) {
    if (i) await sleep(delay);
    const r = await fetchPhoto(handle).catch((e) => ({ error: e.message }));
    if (r.blocked) {
      console.warn(`Instagram is rate-limiting (at ${team} @${handle}); stopping. Re-run later to continue.`);
      break;
    }
    if (r.error) {
      console.warn(`${team} @${handle}: ${r.error}`);
      continue;
    }
    // Content hash as the key: unchanged photos are skipped, and a new photo gets a new immutable URL.
    const key = createHash("sha256").update(r.bytes).digest("hex").slice(0, 32);
    ok++;
    if (ig.get(team) === key) {
      same++;
      continue;
    }
    console.log(`${team} @${handle}: ${r.bytes.length} B${ig.has(team) ? " (changed)" : ""}`);
    writes++;
    stmts.push(
      `INSERT INTO avatar_images (key, png, bytes, fetched_at) VALUES (${sqlStr(key)}, X'${r.bytes.toString("hex")}', ${r.bytes.length}, ${sqlStr(now)}) ON CONFLICT (key) DO NOTHING;`,
      // Never overwrite a FIRST avatar (cmp_year > 0), even one that appeared since we read the table.
      `INSERT INTO team_avatars (team, cmp_year, key, updated_at) VALUES (${team}, 0, ${sqlStr(key)}, ${sqlStr(now)}) ON CONFLICT (team) DO UPDATE SET key = excluded.key, updated_at = excluded.updated_at WHERE team_avatars.cmp_year = 0;`,
    );
  }

  // Instagram avatars whose handle is gone (manual null, website changed). Skipped with --only.
  const stale = only ? [] : [...ig.keys()].filter((t) => !handles.has(t));
  if (stale.length)
    stmts.push(`DELETE FROM team_avatars WHERE cmp_year = 0 AND team IN (${stale.join(",")});`);
  if (stmts.length) stmts.push("DELETE FROM avatar_images WHERE key NOT IN (SELECT key FROM team_avatars);");

  console.log(`fetched ${ok} (${same} unchanged), writing ${writes}, removing ${stale.length}`);
  if (!stmts.length || dry) {
    if (dry && stmts.length) console.log("dry run: nothing written");
    return;
  }

  const dir = mkdtempSync(join(tmpdir(), "ig-avatars-"));
  try {
    const file = join(dir, "avatars.sql");
    writeFileSync(file, stmts.join("\n"));
    wrangler(["d1", "execute", "ftcref", "--remote", "--yes", `--file=${file}`]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  // Pages embed avatar URLs, so bump the avatar-set version that every page cache key includes.
  wrangler(["kv", "key", "put", "avatars", Date.now().toString(36), "--binding=CACHE_VER", "--remote"]);
  console.log("written; page caches bumped");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
