import { describe, expect, it } from "vitest";
import { flagEmoji } from "./flags";

describe("flagEmoji", () => {
  it("maps FIRST country names to flags", () => {
    expect(flagEmoji("USA")).toBe("🇺🇸");
    expect(flagEmoji("Kazakhstan")).toBe("🇰🇿");
    expect(flagEmoji("Türkiye")).toBe("🇹🇷");
    expect(flagEmoji("United Kingdom")).toBe("🇬🇧");
    expect(flagEmoji("Chinese Taipei")).toBe("🇹🇼");
  });

  it("skips countries with no flag", () => {
    expect(flagEmoji("Independent")).toBe("");
    expect(flagEmoji("")).toBe("");
    expect(flagEmoji(null)).toBe("");
  });
});
