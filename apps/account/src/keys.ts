/**
 * API keys: `ftcr_` + 32 random bytes (base64url). We keep a SHA-256 hash of the key, its first few
 * characters (to tell keys apart on the account page), a name, and dates. The key itself is shown
 * once, when it's made, and never stored.
 *
 * Our own table rather than Better Auth's api-key plugin: the plugin writes to D1 on every
 * verification (updatedAt plus usage counters) and sweeps expired keys on most calls. Here a
 * verification is one indexed read; "last used" is written at most once an hour per key, and
 * per-key rate limits use the KEY_LIMIT binding instead of D1.
 */

export const KEY_PREFIX = "ftcr_";
/** `ftcr_` + base64url of 32 bytes. */
const KEY_FORMAT = /^ftcr_[A-Za-z0-9_-]{43}$/;
export const MAX_KEYS = 5;
/** Expiry choices in days; 0 = never. */
export const EXPIRY_DAYS = [30, 90, 365, 0] as const;
/** 1–40 characters, no control characters. Shown only to the key's owner. */
const KEY_NAME = /^[^\p{C}]{1,40}$/u;
const TOUCH_EVERY_MS = 60 * 60 * 1000;

export type KeyInfo = {
  id: string;
  name: string;
  start: string;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
};

export type VerifiedKey = { keyId: string; keyName: string; userId: string; handle: string };

const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

export async function hashKey(key: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function listKeys(db: D1Database, userId: string): Promise<KeyInfo[]> {
  const { results } = await db
    .prepare(
      `SELECT "id", "name", "start", "createdAt", "lastUsedAt", "expiresAt" FROM "api_key"
       WHERE "userId" = ? ORDER BY "createdAt"`,
    )
    .bind(userId)
    .all<KeyInfo>();
  return results;
}

export type CreateResult = { key: string } | { error: "name" | "expiry" | "limit" };

export async function createKey(
  db: D1Database,
  userId: string,
  input: { name: string; days: number },
  now = new Date(),
): Promise<CreateResult> {
  const name = input.name.trim();
  if (!KEY_NAME.test(name)) return { error: "name" };
  if (!(EXPIRY_DAYS as readonly number[]).includes(input.days)) return { error: "expiry" };
  const key = KEY_PREFIX + base64url(crypto.getRandomValues(new Uint8Array(32)));
  const expiresAt = input.days ? new Date(now.getTime() + input.days * 86_400_000).toISOString() : null;
  // The count check and the insert are one statement, so two quick creates can't pass MAX_KEYS.
  const { meta } = await db
    .prepare(
      `INSERT INTO "api_key" ("id", "userId", "name", "start", "hash", "createdAt", "lastUsedAt", "expiresAt")
       SELECT ?, ?, ?, ?, ?, ?, NULL, ?
       WHERE (SELECT count(*) FROM "api_key" WHERE "userId" = ?) < ?`,
    )
    .bind(
      crypto.randomUUID(),
      userId,
      name,
      key.slice(0, KEY_PREFIX.length + 6),
      await hashKey(key),
      now.toISOString(),
      expiresAt,
      userId,
      MAX_KEYS,
    )
    .run();
  return meta.changes ? { key } : { error: "limit" };
}

export async function revokeKey(db: D1Database, userId: string, id: string) {
  await db.prepare(`DELETE FROM "api_key" WHERE "id" = ? AND "userId" = ?`).bind(id, userId).run();
}

export async function deleteKeysOf(db: D1Database, userId: string) {
  await db.prepare(`DELETE FROM "api_key" WHERE "userId" = ?`).bind(userId).run();
}

/**
 * The key's owner, or null for a malformed, unknown or expired key. Malformed keys never reach D1.
 * `touch` is set when "last used" is over an hour old; the caller writes it after responding.
 */
export async function verifyKey(
  db: D1Database,
  key: string,
  now = new Date(),
): Promise<(VerifiedKey & { touch: boolean }) | null> {
  if (!KEY_FORMAT.test(key)) return null;
  const row = await db
    .prepare(
      `SELECT k."id", k."name", k."userId", k."lastUsedAt", k."expiresAt", u."name" AS "handle"
       FROM "api_key" k JOIN "user" u ON u."id" = k."userId" WHERE k."hash" = ?`,
    )
    .bind(await hashKey(key))
    .first<{
      id: string;
      name: string;
      userId: string;
      lastUsedAt: string | null;
      expiresAt: string | null;
      handle: string;
    }>();
  if (!row) return null;
  if (row.expiresAt && Date.parse(row.expiresAt) <= now.getTime()) return null;
  const touch = !row.lastUsedAt || now.getTime() - Date.parse(row.lastUsedAt) > TOUCH_EVERY_MS;
  return { keyId: row.id, keyName: row.name, userId: row.userId, handle: row.handle, touch };
}

export async function touchKey(db: D1Database, id: string, now = new Date()) {
  await db.prepare(`UPDATE "api_key" SET "lastUsedAt" = ? WHERE "id" = ?`).bind(now.toISOString(), id).run();
}
