import { describe, expect, it } from "vitest";
import { SUGGEST_RANK_JS } from "./assets";
import { type SearchIndex, searchIndex } from "./routes/suggest";

type Ranked = { t: SearchIndex["t"]; e: SearchIndex["e"] };
// The same string the browser runs.
const sgRank = new Function(`${SUGGEST_RANK_JS}; return sgRank;`)() as (
  ix: SearchIndex,
  q: string,
  nt: number,
  ne: number,
) => Ranked;

const ix = (): SearchIndex => ({
  t: [
    [42, "Answer Bots", "Austin, TX", 2026],
    [420, "Robo Lions", "Ames, IA", 2024],
    [4201, "Vitruvian Bots", "Mesa, AZ", 2026],
    [4202, "Lions Den", "Reno, NV", 2026],
    [12345, "Cyber Lions", "Leeds, England, UK", 2026],
  ],
  e: [
    [2026, "USAZMEQ1", "Arizona Mesa Qualifier", "Nov 8, 2026 · Mesa, AZ"],
    [2025, "USAZMEQ1", "Arizona Mesa Qualifier", "Nov 9, 2025 · Mesa, AZ"],
    [2025, "FTCCMP1", "FIRST Championship", "Apr 16, 2025 · Houston, TX"],
  ],
});
const nums = (r: Ranked) => r.t.map((t) => t[0]);

describe("sgRank", () => {
  it("matches team numbers by prefix, shortest first", () => {
    expect(nums(sgRank(ix(), "42", 6, 5))).toEqual([42, 420, 4201, 4202]);
    expect(nums(sgRank(ix(), "4201", 6, 5))).toEqual([4201]);
  });

  it("puts name-prefix matches ahead of mid-word ones, recent teams first on ties", () => {
    // "Lions Den" starts with it; the others have it as a later word (4202 and 12345 are 2026, 420 is 2024).
    expect(nums(sgRank(ix(), "lions", 6, 5))).toEqual([4202, 12345, 420]);
  });

  it("needs every word, in the name or the place", () => {
    expect(nums(sgRank(ix(), "lions uk", 6, 5))).toEqual([12345]);
    expect(nums(sgRank(ix(), "bots mesa", 6, 5))).toEqual([4201]);
    expect(nums(sgRank(ix(), "bots paris", 6, 5))).toEqual([]);
  });

  it("finds events by exact code first, then newer seasons", () => {
    const r = sgRank(ix(), "usazmeq1", 6, 5);
    expect(r.e.map((e) => e[0])).toEqual([2026, 2025]);
    expect(sgRank(ix(), "houston", 6, 5).e.map((e) => e[1])).toEqual(["FTCCMP1"]);
  });

  it("caps each list and ignores blank input", () => {
    expect(sgRank(ix(), "4", 2, 5).t).toHaveLength(2);
    expect(sgRank(ix(), "   ", 6, 5)).toEqual({ t: [], e: [] });
  });
});

describe("searchIndex", () => {
  it("packs teams and events into compact rows", () => {
    const out = searchIndex(
      [
        {
          number: 4201,
          name_short: "Vitruvian Bots",
          city: "Mesa",
          state_prov: "AZ",
          country: "USA",
          season: 2026,
        },
        { number: 9999, name_short: null, city: "Leeds", state_prov: null, country: "UK", season: 2024 },
      ],
      [
        {
          season: 2026,
          code: "USAZMEQ1",
          name: "Mesa Qualifier",
          city: "Mesa",
          state_prov: "AZ",
          date_start: "2026-11-08T00:00:00",
        },
      ],
    );
    expect(out.t).toEqual([
      [4201, "Vitruvian Bots", "Mesa, AZ", 2026],
      [9999, "", "Leeds, UK", 2024],
    ]);
    expect(out.e).toEqual([[2026, "USAZMEQ1", "Mesa Qualifier", "Nov 8, 2026 · Mesa, AZ"]]);
  });
});
