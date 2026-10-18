import { describe, expect, it } from "vitest";
import { parseImgur, parseInstagram, parseMedia } from "./media";

describe("parseImgur", () => {
  it("accepts page, direct and bare ids", () => {
    expect(parseImgur("https://imgur.com/AbC123x")).toBe("AbC123x");
    expect(parseImgur("https://i.imgur.com/AbC123x.jpg")).toBe("AbC123x");
    expect(parseImgur("i.imgur.com/AbC123x.png?x=1")).toBe("AbC123x");
    expect(parseImgur("AbC123x")).toBe("AbC123x");
  });
  it("rejects albums, other hosts and junk", () => {
    expect(parseImgur("https://imgur.com/a/AbC123x")).toBeNull();
    expect(parseImgur("https://imgur.com/gallery/AbC123x")).toBeNull();
    expect(parseImgur("https://evil.com/AbC123x")).toBeNull();
    expect(parseImgur("https://notimgur.com/AbC123x")).toBeNull();
    expect(parseImgur("")).toBeNull();
  });
});

describe("parseInstagram / parseMedia", () => {
  it("extracts post and reel shortcodes", () => {
    expect(parseInstagram("https://www.instagram.com/p/C1a_b-2dEf/")).toBe("C1a_b-2dEf");
    expect(parseInstagram("instagram.com/reel/C1a_b-2dEf/?igsh=x")).toBe("C1a_b-2dEf");
    expect(parseInstagram("https://www.instagram.com/someteam/p/C1a_b-2dEf/")).toBe("C1a_b-2dEf");
  });
  it("rejects profiles and other hosts", () => {
    expect(parseInstagram("https://www.instagram.com/someteam/")).toBeNull();
    expect(parseInstagram("https://evilinstagram.com/p/C1a_b-2dEf/")).toBeNull();
  });
  it("detects the kind", () => {
    expect(parseMedia("https://imgur.com/AbC123x")).toEqual({ kind: "imgur", ref: "AbC123x" });
    expect(parseMedia("https://instagram.com/p/C1a_b-2dEf")).toEqual({
      kind: "instagram",
      ref: "C1a_b-2dEf",
    });
    expect(parseMedia("https://example.com/x")).toBeNull();
  });
});
