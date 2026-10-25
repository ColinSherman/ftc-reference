import { describe, expect, it } from "vitest";
import { robotsTxt, seoHead } from "./seoTags";

describe("robotsTxt", () => {
  it("closes every host but the apex", () => {
    expect(robotsTxt("stage.ftc-reference.com")).toBe("User-agent: *\nDisallow: /\n");
    expect(robotsTxt("ftcref-web.example.workers.dev")).toBe("User-agent: *\nDisallow: /\n");
  });
  it("keeps search open on the apex but blocks training bots and crawl traps", () => {
    const r = robotsTxt("ftc-reference.com");
    expect(r).toMatch(/User-agent: ClaudeBot\n(User-agent: .+\n)*Disallow: \/\n/);
    expect(r).toContain("Content-Signal: search=yes, ai-input=yes, ai-train=no");
    for (const p of ["/videos/", "/admin", "/search", "/*?stats=", "/*&per="])
      expect(r).toContain(`Disallow: ${p}\n`);
    expect(r).toContain("Sitemap: https://ftc-reference.com/sitemap.xml");
  });
});

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
