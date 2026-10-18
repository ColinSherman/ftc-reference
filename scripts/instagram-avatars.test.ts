import { describe, expect, it } from "vitest";
// @ts-expect-error plain .mjs script, no type declarations
import { parseInstagramHandle, parseProfilePic } from "./instagram-avatars.mjs";

describe("parseInstagramHandle", () => {
  it("reads profile URLs and bare handles", () => {
    expect(parseInstagramHandle("https://www.instagram.com/roh4216/")).toBe("roh4216");
    expect(parseInstagramHandle("https://www.instagram.com/Pandemonium6942?igsh=djg3&utm_source=qr")).toBe(
      "pandemonium6942",
    );
    expect(parseInstagramHandle("instagram.com/greenhillrobotics")).toBe("greenhillrobotics");
    expect(parseInstagramHandle("@sipi6_ftc")).toBe("sipi6_ftc");
  });
  it("rejects posts, other sites and junk", () => {
    expect(parseInstagramHandle("https://www.instagram.com/p/C1a_b-2dEf/")).toBeNull();
    expect(parseInstagramHandle("https://www.instagram.com/")).toBeNull();
    expect(parseInstagramHandle("https://evilinstagram.com/team")).toBeNull();
    expect(parseInstagramHandle("https://example.org/team")).toBeNull();
    expect(parseInstagramHandle(null)).toBeNull();
  });
});

describe("parseProfilePic", () => {
  it("unescapes the og:image URL", () => {
    const html =
      '<meta property="og:image" content="https://scontent.cdninstagram.com/v/x.jpg?a=1&amp;b=2" />';
    expect(parseProfilePic(html)).toBe("https://scontent.cdninstagram.com/v/x.jpg?a=1&b=2");
    expect(parseProfilePic("<html></html>")).toBeNull();
  });
});
