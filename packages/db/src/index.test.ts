import { describe, expect, it } from "vitest";
import { D1_MAX_PARAMS, type Row, upsertStatements } from "./index";

const fakeDb = () => {
  const stmts: { sql: string; params: unknown[] }[] = [];
  const db = {
    prepare(sql: string) {
      return {
        bind(...params: unknown[]) {
          stmts.push({ sql, params });
          return {};
        },
      };
    },
  } as unknown as D1Database;
  return { db, stmts };
};

describe("upsertStatements", () => {
  it("chunks so every statement stays within the D1 parameter limit", () => {
    const { db, stmts } = fakeDb();
    const rows = Array.from({ length: 50 }, (_, i) => ({ a: i, b: "x", c: null, d: 1, e: 2, f: 3, g: 4 }));
    upsertStatements(db, "t", rows, ["a"]);
    expect(stmts.every((s) => s.params.length <= D1_MAX_PARAMS)).toBe(true);
    expect(stmts.reduce((n, s) => n + s.params.length, 0)).toBe(50 * 7);
    expect(stmts[0]?.sql).toContain("ON CONFLICT (a) DO UPDATE SET b=excluded.b");
  });
});

describe("upsertStatements value coercion", () => {
  it("binds booleans as 0/1 and objects as JSON instead of throwing", () => {
    const { db, stmts } = fakeDb();
    upsertStatements(db, "t", [{ a: 1, b: true, c: { x: 1 } } as unknown as Row], ["a"]);
    expect(stmts[0]?.params).toEqual([1, 1, '{"x":1}']);
  });
});
