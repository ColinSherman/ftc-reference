import { describe, expect, it } from "vitest";
import { pageSizeOf, slicePage } from "./paging";

describe("page size", () => {
  it("accepts only the dropdown sizes", () => {
    expect(pageSizeOf("100")).toBe(100);
    expect(pageSizeOf("500")).toBe(500);
    expect(pageSizeOf("40")).toBeNull();
    expect(pageSizeOf("")).toBeNull();
    expect(pageSizeOf(undefined)).toBeNull();
  });
});

describe("slicePage", () => {
  const rows = Array.from({ length: 250 }, (_, i) => i);

  it("returns the first page", () => {
    const p = slicePage(rows, 1, 100);
    expect(p.page).toBe(1);
    expect(p.pages).toBe(3);
    expect(p.start).toBe(0);
    expect(p.rows.length).toBe(100);
    expect(p.rows[0]).toBe(0);
  });

  it("clamps a page past the end", () => {
    const p = slicePage(rows, 99, 100);
    expect(p.page).toBe(3);
    expect(p.start).toBe(200);
    expect(p.rows[0]).toBe(200);
    expect(p.rows.length).toBe(50);
  });
});
