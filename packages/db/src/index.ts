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
  /** Keep existing rows untouched (insert only new ones). */
  opts: { ignoreExisting?: boolean } = {},
): D1PreparedStatement[] {
  const first = rows[0];
  if (!first) return [];
  const cols = Object.keys(first);
  const perStmt = Math.max(1, Math.floor(D1_MAX_PARAMS / cols.length));
  const updates = cols.filter((c) => !conflict.includes(c));
  const onConflict =
    updates.length && !opts.ignoreExisting
      ? `DO UPDATE SET ${updates.map((c) => `${c}=excluded.${c}`).join(",")}`
      : "DO NOTHING";
  const placeholder = `(${cols.map(() => "?").join(",")})`;

  const out: D1PreparedStatement[] = [];
  for (let i = 0; i < rows.length; i += perStmt) {
    const chunk = rows.slice(i, i + perStmt);
    const sql =
      `INSERT INTO ${table} (${cols.join(",")}) VALUES ${chunk.map(() => placeholder).join(",")} ` +
      `ON CONFLICT (${conflict.join(",")}) ${onConflict}`;
    out.push(db.prepare(sql).bind(...chunk.flatMap((r) => cols.map((c) => bindable(table, c, r[c])))));
  }
  return out;
}

/**
 * D1 only binds primitives. The FTC API occasionally returns an object/array where its docs
 * promise a scalar; store it as JSON (and log where) instead of failing the whole event.
 */
function bindable(table: string, col: string, v: unknown): string | number | null {
  if (v == null) return null;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "string" || typeof v === "number") return v;
  console.warn(`non-scalar value for ${table}.${col}: ${JSON.stringify(v).slice(0, 200)}`);
  return JSON.stringify(v);
}

/** Run statements in batches (each batch is one implicit transaction). */
export async function runBatched(db: D1Database, stmts: D1PreparedStatement[], size = 200) {
  for (let i = 0; i < stmts.length; i += size) await db.batch(stmts.slice(i, i + size));
}

export const bool = (v: unknown) => (v ? 1 : 0);
