import { describe, expect, it } from "vitest";
import { computeOpr } from "./opr";

describe("computeOpr", () => {
  it("recovers exact team contributions from consistent alliances", () => {
    const truth: Record<number, number> = { 1: 10, 2: 20, 3: 30, 4: 40 };
    const pairs = [
      [1, 2],
      [3, 4],
      [1, 3],
      [2, 4],
      [1, 4],
      [2, 3],
    ];
    const obs = pairs.map((teams) => ({ teams, values: [teams.reduce((s, t) => s + (truth[t] ?? 0), 0)] }));
    const opr = computeOpr(obs, 1);
    for (const [t, v] of Object.entries(truth)) expect(opr.get(Number(t))?.[0]).toBeCloseTo(v, 1);
  });

  it("handles multiple components and underdetermined events", () => {
    const opr = computeOpr([{ teams: [5, 6], values: [50, 8] }], 2);
    expect(opr.get(5)?.[0]).toBeCloseTo(25, 1);
    expect(opr.get(6)?.[1]).toBeCloseTo(4, 1);
  });
});
