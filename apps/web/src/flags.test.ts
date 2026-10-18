import { describe, expect, it } from "vitest";
import { flagCode, placeTitle } from "./flags";

describe("flagCode", () => {
  it("maps country names and falls back to region codes", () => {
    expect(flagCode("USA")).toBe("us");
    expect(flagCode("Canada")).toBe("ca");
    expect(flagCode("Türkiye")).toBe("tr");
    expect(flagCode("Kazakhstan")).toBe("kz");
    expect(flagCode("Chinese Taipei")).toBe("tw");
    expect(flagCode(null, "USCALA")).toBe("us");
    expect(flagCode("", "CAON")).toBe("ca");
    expect(flagCode(null, "DE")).toBe("de");
    expect(flagCode(null, "HKG")).toBe("hk");
    expect(flagCode(null, "CMPZ2")).toBeNull();
    expect(flagCode("Atlantis")).toBeNull();
  });
});

describe("placeTitle", () => {
  it("joins place and region", () => {
    expect(placeTitle({ city: "Torrance", state_prov: "CA", country: "USA", home_region: "USCALA" })).toBe(
      "Torrance, CA, USA · Region: California - Los Angeles",
    );
  });
});
