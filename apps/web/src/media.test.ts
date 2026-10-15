import { describe, expect, it } from "vitest";
import { parseImgur } from "./media";

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
