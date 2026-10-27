// Guards the staging/production split (CLAUDE.md "Environments"): every staging binding must be a
// staging resource. stage-resources runs the same check in CI before anything is written.
// Also covers splitDump, which stage-seed uses to import production's dump in D1-sized pieces.
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { assertStagingIsolated, checkIsolated, splitDump } from "./stage-lib.mjs";

const prod = {
  d1_databases: [{ database_name: "ftcref-auth", database_id: "prod-auth" }],
  services: [{ binding: "ACCOUNT", service: "ftcref-account" }],
  ratelimits: [{ name: "AUTH_LIMIT", namespace_id: "1001" }],
};
const staging = {
  d1_databases: [{ database_name: "ftcref-stage-auth", database_id: "stage-auth" }],
  services: [{ binding: "ACCOUNT", service: "ftcref-account-stage" }],
  ratelimits: [{ name: "AUTH_LIMIT", namespace_id: "1002" }],
};
const check = (stage: object) => () =>
  checkIsolated({ ...prod, env: { staging: { ...staging, ...stage } } }, "test");

describe("staging isolation", () => {
  it("passes for the committed wrangler configs", () => {
    expect(() => assertStagingIsolated()).not.toThrow();
  });

  it("accepts staging-only D1s, services and rate limits", () => {
    expect(check({})).not.toThrow();
  });

  it("rejects a production D1, Worker or rate limit in staging", () => {
    expect(check({ d1_databases: prod.d1_databases })).toThrow(/D1 ftcref-auth/);
    expect(check({ d1_databases: [{ database_name: "ftcref-other", database_id: "x" }] })).toThrow(/D1/);
    expect(check({ services: prod.services })).toThrow(/service ftcref-account/);
    expect(check({ ratelimits: prod.ratelimits })).toThrow(/rate limit namespace 1001/);
  });
});

const DUMP = [
  "PRAGMA defer_foreign_keys=TRUE;",
  "CREATE TABLE t (",
  "  a INTEGER PRIMARY KEY,",
  "  b TEXT",
  ") STRICT;",
  `INSERT INTO "t" ("a","b") VALUES(1,'one');`,
  `INSERT INTO "t" ("a","b") VALUES(2,'it''s;`,
  `two lines;');`,
  `INSERT INTO "t" ("a","b") VALUES(3,'three');`,
  "CREATE INDEX t_by_b ON t (b);",
  "CREATE UNIQUE INDEX t_u ON t (b, a);",
].join("\n");

async function split(maxChars: number): Promise<string[]> {
  const dir = mkdtempSync(join(tmpdir(), "split-"));
  const dump = join(dir, "dump.sql");
  writeFileSync(dump, `${DUMP}\n`);
  const files: string[] = await splitDump(dump, dir, maxChars);
  return files.map((f) => readFileSync(f, "utf8"));
}

describe("splitDump", () => {
  it("keeps every statement whole and in order, PRAGMA on top of each part", async () => {
    const parts = await split(60);
    for (const p of parts) expect(p.startsWith("PRAGMA defer_foreign_keys=TRUE;\n")).toBe(true);
    const body = parts.map((p) => p.replace("PRAGMA defer_foreign_keys=TRUE;\n", "")).join("");
    const expected = DUMP.replace("PRAGMA defer_foreign_keys=TRUE;\n", "")
      .replaceAll("INSERT INTO ", "INSERT OR IGNORE INTO ")
      .replace("CREATE TABLE ", "CREATE TABLE IF NOT EXISTS ")
      .replaceAll(/INDEX (t_\w+)/g, "INDEX IF NOT EXISTS $1");
    expect(body).toBe(`${expected}\n`);
    // The string spanning two lines, with `;` and '' inside, stays in one part.
    expect(parts.some((p) => p.includes("VALUES(2,'it''s;\ntwo lines;');"))).toBe(true);
  });

  it("packs statements up to the size limit", async () => {
    const parts = await split(1e6);
    expect(parts).toHaveLength(3); // table + rows, then one part per index
  });

  it("gives each CREATE INDEX a part of its own", async () => {
    const parts = await split(1e6);
    expect(parts[1]).toBe("PRAGMA defer_foreign_keys=TRUE;\nCREATE INDEX IF NOT EXISTS t_by_b ON t (b);\n");
    expect(parts[2]).toBe(
      "PRAGMA defer_foreign_keys=TRUE;\nCREATE UNIQUE INDEX IF NOT EXISTS t_u ON t (b, a);\n",
    );
  });

  it("makes every statement safe to import twice", async () => {
    const [first] = await split(1e6);
    expect(first).toContain("CREATE TABLE IF NOT EXISTS t (");
    expect(first).not.toMatch(/^INSERT INTO /m);
    expect(first?.match(/^INSERT OR IGNORE INTO /gm)).toHaveLength(3);
  });
});
