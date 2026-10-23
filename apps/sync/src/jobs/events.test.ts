import { FtcApiError } from "@ftcref/ftc-api";
import { describe, expect, it } from "vitest";
import { isInvalidEvent, removedStatements } from "./events";

/** Fake D1 that answers the "how many events do we hold" count and records prepared SQL. */
function fakeDb(held: number) {
  const sql: string[] = [];
  const db = {
    prepare(q: string) {
      sql.push(q);
      return { bind: () => ({ first: async () => ({ n: held }) }) };
    },
  } as unknown as D1Database;
  return { db, sql };
}

describe("removed events", () => {
  it("recognises FIRST's answer for an event it no longer has", () => {
    const msg = '"Invalid Event Requested : No event was found using the Season 2026 and Event Code USMIFRQ"';
    expect(isInvalidEvent(new FtcApiError(404, "teams?eventCode=USMIFRQ", msg))).toBe(true);
    expect(isInvalidEvent(new FtcApiError(404, "scores/X/qual", "Not Found"))).toBe(false);
    expect(isInvalidEvent(new FtcApiError(500, "teams?eventCode=X", msg))).toBe(false);
    expect(isInvalidEvent(new Error(msg))).toBe(false);
  });

  it("flags events missing from a full season list", async () => {
    const { db, sql } = fakeDb(100);
    const codes = Array.from({ length: 98 }, (_, i) => `E${i}`);
    expect(await removedStatements(db, 2026, codes, "2026-10-23T00:00:00Z")).toHaveLength(1);
    expect(sql.at(-1)).toContain("UPDATE events SET removed_at");
  });

  it("flags nothing on a 304, an empty list, or a suspiciously short list", async () => {
    expect(await removedStatements(fakeDb(100).db, 2026, null, "t")).toEqual([]);
    expect(await removedStatements(fakeDb(100).db, 2026, [], "t")).toEqual([]);
    const half = Array.from({ length: 50 }, (_, i) => `E${i}`);
    expect(await removedStatements(fakeDb(100).db, 2026, half, "t")).toEqual([]);
  });
});
