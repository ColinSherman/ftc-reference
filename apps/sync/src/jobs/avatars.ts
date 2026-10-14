import { nowIso, runBatched } from "@ftcref/db";
import type { Env, SyncMessage } from "../env";

export const AVATAR_HOST = "https://ftc-api.firstinspires.org";
const BATCH = 40;
const CONCURRENCY = 6;

export interface AvatarRef {
  team: number;
  key: string;
  path: string;
}

/**
 * Parse FIRST's composed avatar stylesheet. Rules look like:
 *   .team-9999 { background-image: url("/ftc/2027/avatars/composed/9999_<uuid>"); }
 * The generic `.team-avatar` fallback (a data: URI) is ignored.
 */
export function parseAvatarCss(css: string): AvatarRef[] {
  const out: AvatarRef[] = [];
  const re = /\.team-(\d+)\s*\{\s*background-image:\s*url\("(\/[^"]+\/(\d+)_([0-9a-f-]{8,}))"\)/g;
  for (const m of css.matchAll(re)) {
    if (m[1] !== m[3]) continue; // team in selector must match the file name
    out.push({ team: Number(m[1]), path: m[2] as string, key: m[4] as string });
  }
  return out;
}

/**
 * Daily: conditionally fetch the stylesheet, diff against team_avatars, and enqueue downloads
 * for new/changed avatars. Removed avatars are deleted immediately.
 */
export async function syncAvatars(env: Env, cmpYear: number, enqueue: (m: SyncMessage[]) => Promise<void>) {
  const stateKey = `avatars/${cmpYear}.css`;
  const state = await env.DB.prepare("SELECT last_modified FROM sync_state WHERE key = ?")
    .bind(stateKey)
    .first<{ last_modified: string | null }>();
  const headers: Record<string, string> = {};
  if (state?.last_modified) headers["If-Modified-Since"] = state.last_modified;

  const res = await fetch(`${AVATAR_HOST}/avatars/composed/${cmpYear}.css`, { headers });
  const now = nowIso();
  if (res.status === 304) {
    await env.DB.prepare("UPDATE sync_state SET last_checked_at = ? WHERE key = ?").bind(now, stateKey).run();
    return { changed: 0, removed: 0 };
  }
  if (!res.ok) throw new Error(`avatar css ${res.status}`);

  const refs = parseAvatarCss(await res.text());
  const { results: existing } = await env.DB.prepare("SELECT team, key FROM team_avatars WHERE cmp_year = ?")
    .bind(cmpYear)
    .all<{ team: number; key: string }>();
  const have = new Map(existing.map((r) => [r.team, r.key]));
  const listed = new Set(refs.map((r) => r.team));

  const todo = refs.filter((r) => have.get(r.team) !== r.key);
  const removed = existing.filter((r) => !listed.has(r.team)).map((r) => r.team);

  const msgs: SyncMessage[] = [];
  for (let i = 0; i < todo.length; i += BATCH) {
    msgs.push({ job: "avatarFetch", cmpYear, refs: todo.slice(i, i + BATCH) });
  }
  await enqueue(msgs);

  const stmts = removed.map((t) => env.DB.prepare("DELETE FROM team_avatars WHERE team = ?").bind(t));
  stmts.push(
    env.DB.prepare(
      "INSERT INTO sync_state (key, last_modified, last_checked_at, last_changed_at) VALUES (?1, ?2, ?3, ?3) " +
        "ON CONFLICT (key) DO UPDATE SET last_modified = ?2, last_checked_at = ?3, last_changed_at = ?3",
    ).bind(stateKey, res.headers.get("Last-Modified"), now),
  );
  await runBatched(env.DB, stmts);
  if (removed.length) await bumpAvatars(env);
  return { changed: todo.length, removed: removed.length };
}

/** Download one batch of PNGs and record them. Image first, then the pointer, so pages never 404. */
export async function fetchAvatarBatch(env: Env, cmpYear: number, refs: AvatarRef[]) {
  const now = nowIso();
  const stmts: D1PreparedStatement[] = [];
  let i = 0;
  const worker = async () => {
    while (i < refs.length) {
      const r = refs[i++] as AvatarRef;
      const res = await fetch(`${AVATAR_HOST}${r.path}`);
      if (!res.ok) {
        console.warn(`avatar ${r.team} ${res.status}`);
        continue;
      }
      const png = await res.arrayBuffer();
      if (png.byteLength > 64 * 1024) continue; // FIRST caps uploads at 20 kB; ignore anything odd
      stmts.push(
        env.DB.prepare(
          "INSERT INTO avatar_images (key, png, bytes, fetched_at) VALUES (?, ?, ?, ?) ON CONFLICT (key) DO NOTHING",
        ).bind(r.key, png, png.byteLength, now),
        env.DB.prepare(
          "INSERT INTO team_avatars (team, cmp_year, key, updated_at) VALUES (?1, ?2, ?3, ?4) " +
            "ON CONFLICT (team) DO UPDATE SET cmp_year = ?2, key = ?3, updated_at = ?4",
        ).bind(r.team, cmpYear, r.key, now),
      );
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  await runBatched(env.DB, stmts);
  // Drop image rows no team points at any more (old versions of changed avatars).
  await env.DB.prepare("DELETE FROM avatar_images WHERE key NOT IN (SELECT key FROM team_avatars)").run();
  await bumpAvatars(env);
  return stmts.length / 2;
}

/** Pages include avatar URLs, so their cache keys include this version. */
export const bumpAvatars = (env: Env) => env.CACHE_VER.put("avatars", Date.now().toString(36));
