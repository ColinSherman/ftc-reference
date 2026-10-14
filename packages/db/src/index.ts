/** D1 caps bound parameters per statement at 100. */
export const D1_MAX_PARAMS = 100;

export type Row = Record<string, string | number | null>;

export const nowIso = () => new Date().toISOString();

/**
 * Build multi-row `INSERT … ON CONFLICT DO UPDATE` statements, chunked so each stays under
 * D1's parameter limit. Returned statements should be run together with `db.batch()`.
 */
export function upsertStatements(
  db: D1Database,
  table: string,
  rows: Row[],
  conflict: string[],
): D1PreparedStatement[] {
  const first = rows[0];
  if (!first) return [];
  const cols = Object.keys(first);
  const perStmt = Math.max(1, Math.floor(D1_MAX_PARAMS / cols.length));
  const updates = cols.filter((c) => !conflict.includes(c));
  const onConflict = updates.length
    ? `DO UPDATE SET ${updates.map((c) => `${c}=excluded.${c}`).join(",")}`
    : "DO NOTHING";
  const placeholder = `(${cols.map(() => "?").join(",")})`;

  const out: D1PreparedStatement[] = [];
  for (let i = 0; i < rows.length; i += perStmt) {
    const chunk = rows.slice(i, i + perStmt);
    const sql =
      `INSERT INTO ${table} (${cols.join(",")}) VALUES ${chunk.map(() => placeholder).join(",")} ` +
      `ON CONFLICT (${conflict.join(",")}) ${onConflict}`;
    out.push(db.prepare(sql).bind(...chunk.flatMap((r) => cols.map((c) => r[c] ?? null))));
  }
  return out;
}

/** Run statements in batches (each batch is one implicit transaction). */
export async function runBatched(db: D1Database, stmts: D1PreparedStatement[], size = 200) {
  for (let i = 0; i < stmts.length; i += size) await db.batch(stmts.slice(i, i + size));
}

export const bool = (v: unknown) => (v ? 1 : 0);
