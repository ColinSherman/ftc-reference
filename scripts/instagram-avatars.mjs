// Fill avatar gaps with teams' Instagram profile photos. FIRST avatars always win; this only writes
// teams with no FIRST avatar, as team_avatars rows with cmp_year = 0 (lower than any FIRST year, so a
// later FIRST avatar replaces it through the normal sync).
//
// Instagram refuses unauthenticated requests from Cloudflare's network, so this runs from your own
// machine and writes to D1 through wrangler (your login, the account pinned in apps/sync).
//
// Handles, highest priority first:
//   1. scripts/instagram-handles.json ({ "34730": "sipi6_ftc" }; a null value suppresses a team)
//   2. FIRST's team `website` field when it is an instagram.com profile
//   3. an Instagram link found on the team's website: the home page, then up to a few same-site
//      contact/about/social pages. Results are cached in scripts/instagram-discovered.json (keyed by
//      website, so a changed site is re-crawled); review it and override mistakes in (1).
// Teams are processed best-first (NP OPR) so a rate-limited run still covers the top teams.
//
// Usage: node scripts/instagram-avatars.mjs [--dry-run] [--only=34730,9626] [--delay=2000] [--rediscover] [--discover-only]
// (--discover-only crawls team websites and updates the cache without touching Instagram or D1.)
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SYNC_DIR = join(ROOT, "apps", "sync");
const HANDLES_FILE = join(ROOT, "scripts", "instagram-handles.json");
const DISCOVERED_FILE = join(ROOT, "scripts", "instagram-discovered.json");
const UA = "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)";
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const MAX_BYTES = 48 * 1024; // profile photos are ~4 KB 100×100 JPEGs; keeps each INSERT well under D1's limit
const MAX_PAGE = 3 * 1024 * 1024;
const SUBPAGES = 5; // same-site pages tried after the home page
// Pages likely to link the team's socials: the first group is tried before the second.
const SUBPAGE_RES = [/contact|connect|social|follow|links?\b|reach|find-us/i, /about|team/i];
const CRAWL_CONCURRENCY = 8;
// Paths under instagram.com that aren't profiles.
const RESERVED = new Set([
  "p",
  "reel",
  "reels",
  "tv",
  "stories",
  "explore",
  "accounts",
  "direct",
  "share",
  "invites",
  "web",
  "about",
  "developer",
  "legal",
  "privacy",
  "help",
  "challenge",
  "embed.js",
  "rsrc.php",
]);
// Accounts team sites link to that aren't the team: FIRST itself and site builders' footers.
const NOT_TEAMS = new Set([
  "firstinspires",
  "firstinspiresorg",
  "firsttechchallenge",
  "first_tech_challenge",
  "firstftc",
  "firstroboticscompetition",
  "firstlegoleague",
  "first_robotics",
  "wix",
  "squarespace",
  "weebly",
  "godaddy",
  "instagram",
  "linktr.ee",
  "linktree",
]);

/** Instagram username from a profile URL (or a bare handle / @handle), else null. */
export function parseInstagramHandle(input) {
  if (!input) return null;
  const s = String(input).trim();
  if (/^@?[A-Za-z0-9._]{1,30}$/.test(s)) {
    const h = s.replace(/^@/, "").toLowerCase();
    return RESERVED.has(h) ? null : h;
  }
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

// Words that mark an account as a robotics team's rather than its school's or district's.
const TEAM_WORDS = /ftc|frc|fll|robot|bot|mech|gear|team/;
const NAME_STOPWORDS = new Set(["team", "the", "robotics", "robotic", "high", "school", "academy", "club"]);
const MAX_SHARED = 3; // a handle found on more sites than this is a template/org account, not a team's

/**
 * Whether a handle found by crawling a team's website is plausibly that team's own account: it names
 * the team number, a robotics word, or a distinctive word from the team name. School and district
 * accounts linked from the same pages fail this, which costs some real teams but avoids wrong avatars.
 */
export function plausibleTeamHandle(handle, team, name) {
  const h = handle.replace(/[._]/g, "");
  if (h.startsWith("first")) return h.includes(String(team)); // national FIRST partners' accounts
  if (h.includes(String(team)) || TEAM_WORDS.test(h)) return true;
  // Teams are often named after their school, whose account then shares the name.
  if (/school|district|academy|college|universit|isd|hs$|ms$|prep$/.test(h)) return false;
  const words = String(name ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4 && !NAME_STOPWORDS.has(w));
  return words.some((w) => h.includes(w));
}

/** Instagram profile handles linked from a web page, most-linked first, minus non-team accounts. */
export function findInstagramHandles(html) {
  // Undo the encodings links hide behind: HTML entities, JSON-escaped slashes, redirect wrappers.
  const text = html
    .replaceAll("&amp;", "&")
    .replaceAll("\\/", "/")
    .replace(/%2F/gi, "/")
    .replace(/%3A/gi, ":");
  const counts = new Map();
  for (const m of text.matchAll(/instagram\.com\/([A-Za-z0-9._]{1,30})/gi)) {
    const h = parseInstagramHandle(`instagram.com/${m[1]}`);
    if (h && !NOT_TEAMS.has(h)) counts.set(h, (counts.get(h) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1]).map(([h]) => h);
}

/** Same-site links that look like contact/social pages, then about pages; shallow paths first. */
export function findSubpages(html, base) {
  const host = new URL(base).hostname.replace(/^www\./, "");
  const found = new Map(); // href → [group, path depth, page order]
  for (const m of html.matchAll(/<a\b[^>]*href="([^"#]+)"[^>]*>([\s\S]{0,300}?)<\/a>/gi)) {
    let u;
    try {
      u = new URL((m[1] ?? "").replaceAll("&amp;", "&"), base);
    } catch {
      continue;
    }
    if (u.hostname.replace(/^www\./, "") !== host || !/^https?:$/.test(u.protocol)) continue;
    if (/\.(pdf|jpe?g|png|gif|zip|docx?)$/i.test(u.pathname)) continue;
    const label = `${u.pathname} ${(m[2] ?? "").replace(/<[^>]+>/g, " ")}`;
    const group = SUBPAGE_RES.findIndex((re) => re.test(label));
    if (group < 0 || found.has(u.href) || u.href === new URL(base).href) continue;
    found.set(u.href, [group, u.pathname.split("/").filter(Boolean).length, found.size]);
  }
  return [...found].sort(([, a], [, b]) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]).map(([href]) => href);
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

async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (i < items.length) await fn(items[i++]);
    }),
  );
}

async function getPage(url) {
  try {
    const res = await fetch(url, {
      headers: { "user-agent": BROWSER_UA, accept: "text/html" },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok || !/html/i.test(res.headers.get("content-type") ?? "html")) return null;
    const html = await res.text();
    return html.length > MAX_PAGE ? null : { html, url: res.url };
  } catch {
    return null;
  }
}

/** Crawl a team website for its Instagram handle: home page first, then likely subpages. */
async function discoverHandle(website) {
  const home = await getPage(/^https?:\/\//i.test(website) ? website : `https://${website}`);
  if (!home) return { handle: null };
  let found = findInstagramHandles(home.html);
  if (found[0]) return { handle: found[0], from: home.url };
  for (const sub of findSubpages(home.html, home.url).slice(0, SUBPAGES)) {
    const page = await getPage(sub);
    found = page ? findInstagramHandles(page.html) : [];
    if (found[0]) return { handle: found[0], from: sub };
  }
  return { handle: null };
}

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
  const discovered = existsSync(DISCOVERED_FILE) ? JSON.parse(readFileSync(DISCOVERED_FILE, "utf8")) : {};
  const sites = query(
    "SELECT number, name_short, website FROM teams WHERE website IS NOT NULL AND trim(website) != ''",
  );
  const avatars = query("SELECT team, cmp_year, key FROM team_avatars");
  const first = new Set(avatars.filter((r) => r.cmp_year > 0).map((r) => r.team));
  const ig = new Map(avatars.filter((r) => r.cmp_year === 0).map((r) => [r.team, r.key]));
  // Best NP OPR in any season; unranked teams go last.
  const best = new Map(
    query("SELECT team, MAX(best_opr_np) AS v FROM team_official_stats GROUP BY team").map((r) => [
      r.team,
      r.v,
    ]),
  );
  const byBest = (a, b) => (best.get(b) ?? -1e9) - (best.get(a) ?? -1e9);

  /** team → handle: the FIRST website field, then the team website's links, then manual entries on top. */
  const handles = new Map();
  const crawl = [];
  for (const r of sites) {
    const h = parseInstagramHandle(r.website);
    if (h) handles.set(r.number, h);
    else if (!first.has(r.number) && !(String(r.number) in manual)) crawl.push(r);
  }

  const toCrawl = crawl
    .filter(
      (r) => (!only || only.has(r.number)) && (args.rediscover || discovered[r.number]?.site !== r.website),
    )
    .sort((a, b) => byBest(a.number, b.number));
  if (toCrawl.length) console.log(`crawling ${toCrawl.length} team websites for Instagram links…`);
  await pool(toCrawl, CRAWL_CONCURRENCY, async (r) => {
    const d = await discoverHandle(r.website);
    discovered[r.number] = { site: r.website, handle: d.handle, ...(d.from ? { from: d.from } : {}) };
    if (d.handle) console.log(`${r.number}: @${d.handle} (${d.from})`);
  });
  if (toCrawl.length) {
    const sorted = Object.fromEntries(Object.entries(discovered).sort((a, b) => Number(a[0]) - Number(b[0])));
    writeFileSync(DISCOVERED_FILE, `${JSON.stringify(sorted, null, 2)}\n`);
  }
  const shared = new Map();
  for (const d of Object.values(discovered))
    if (d.handle) shared.set(d.handle, (shared.get(d.handle) ?? 0) + 1);
  let rejected = 0;
  for (const r of crawl) {
    const d = discovered[r.number];
    // Re-checked on every run, so tightening a rule applies to cached results without a re-crawl.
    const h = d?.site === r.website ? parseInstagramHandle(d.handle) : null;
    if (!h || NOT_TEAMS.has(h)) continue;
    if ((shared.get(h) ?? 0) > MAX_SHARED || !plausibleTeamHandle(h, r.number, r.name_short)) {
      rejected++;
      if (args.verbose) console.log(`skip ${r.number} @${h} (doesn't look like the team's account)`);
      continue;
    }
    handles.set(r.number, h);
  }
  if (rejected)
    console.log(`${rejected} crawled handles skipped as likely school/org accounts (--verbose lists them)`);
  if (args["discover-only"]) {
    const n = crawl.filter((r) => handles.has(r.number)).length;
    console.log(
      `accepted crawled handles for ${n} of ${crawl.length} crawlable teams; nothing fetched from Instagram`,
    );
    return;
  }

  for (const [team, h] of Object.entries(manual)) {
    if (team.startsWith("_")) continue; // comment keys
    const parsed = h === null ? null : parseInstagramHandle(h);
    if (h !== null && !parsed) console.warn(`manual entry ${team}: can't read handle "${h}"`);
    if (parsed) handles.set(Number(team), parsed);
    else handles.delete(Number(team));
  }

  const todo = [...handles]
    .filter(([t]) => !first.has(t) && (!only || only.has(t)))
    .sort((a, b) => byBest(a[0], b[0]));
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
