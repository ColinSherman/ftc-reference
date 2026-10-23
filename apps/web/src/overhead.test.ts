import { describe, expect, it } from "vitest";
import { overRuns } from "./overhead";

describe("overRuns", () => {
  it("merges neighbouring columns with the same group", () => {
    expect(overRuns(2, ["OPR", "OPR", "OPR", "Defense", "Defense", "Alliance score"])).toEqual([
      ["", 2],
      ["OPR", 3],
      ["Defense", 2],
      ["Alliance score", 1],
    ]);
  });
  it("spans exactly the table's columns", () => {
    const groups = ["A", "A", "", "B", "A"];
    const total = overRuns(4, groups).reduce((s, [, n]) => s + n, 0);
    expect(total).toBe(4 + groups.length);
  });
  it("keeps gaps one column wide and splits a group that is interrupted", () => {
    expect(overRuns(0, ["A", "", "", "A"])).toEqual([
      ["A", 1],
      ["", 1],
      ["", 1],
      ["A", 1],
    ]);
  });
});
