import { describe, expect, it } from "vitest";
import { flagCode } from "./flags";

describe("flagCode", () => {
  it("maps FIRST country names to ISO codes", () => {
    expect(flagCode("USA")).toBe("us");
    expect(flagCode("Kazakhstan")).toBe("kz");
    expect(flagCode("Türkiye")).toBe("tr");
    expect(flagCode("United Kingdom")).toBe("gb");
    expect(flagCode("Chinese Taipei")).toBe("tw");
  });

  it("skips countries with no flag", () => {
    expect(flagCode("Independent")).toBe("");
    expect(flagCode("")).toBe("");
    expect(flagCode(null)).toBe("");
  });
});
