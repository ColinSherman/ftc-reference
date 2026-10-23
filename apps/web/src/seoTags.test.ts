import { describe, expect, it } from "vitest";
import { seoHead } from "./seoTags";

const h = (u: string, status = 200) => seoHead(new URL(u), status);

describe("seoHead", () => {
  it("canonicalises clean URLs", () => {
    expect(h("https://ftc-reference.com/teams/4201")).toEqual({
      canonical: "https://ftc-reference.com/teams/4201",
      noindex: false,
    });
    expect(h("https://ftc-reference.com/")).toMatchObject({ canonical: "https://ftc-reference.com/" });
  });
  it("strips tracking params and trailing slashes", () => {
    expect(h("https://ftc-reference.com/events/2026/USCAFFL1/?utm_source=x&fbclid=y").canonical).toBe(
      "https://ftc-reference.com/events/2026/USCAFFL1",
    );
  });
  it("noindexes filtered and paged variants without a canonical", () => {
    expect(h("https://ftc-reference.com/events/2026?type=comp&page=2")).toEqual({
      canonical: null,
      noindex: true,
    });
    expect(h("https://ftc-reference.com/seasons/2026/leaders?col=c1")).toMatchObject({ noindex: true });
  });
  it("noindexes errors, private paths and non-apex hosts", () => {
    expect(h("https://ftc-reference.com/nope", 404).noindex).toBe(true);
    expect(h("https://ftc-reference.com/search?q=a").noindex).toBe(true);
    expect(h("https://ftc-reference.com/admin/runs").noindex).toBe(true);
    expect(h("https://stage.ftc-reference.com/teams/4201").noindex).toBe(true);
  });
});
