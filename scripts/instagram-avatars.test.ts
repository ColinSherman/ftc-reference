import { describe, expect, it } from "vitest";
// @ts-expect-error plain .mjs script, no type declarations
import {
  findInstagramHandles,
  findSubpages,
  parseInstagramHandle,
  parseProfilePic,
  plausibleTeamHandle,
} from "./instagram-avatars.mjs";

describe("findInstagramHandles", () => {
  it("finds plain, escaped and redirect-wrapped links, most-linked first", () => {
    const html = `
      <a href="https://www.instagram.com/firstinspires/">FIRST</a>
      <a href="https://www.google.com/url?q=https%3A%2F%2Fwww.instagram.com%2Ftechnototes_16750%2F&amp;sa=D">IG</a>
      <a href="https://instagram.com/technototes_16750/">IG</a>
      <script>{"u":"https:\\/\\/www.instagram.com\\/otherteam\\/"}</script>
      <a href="https://www.instagram.com/p/C1a_b-2dEf/">post</a>`;
    expect(findInstagramHandles(html)).toEqual(["technototes_16750", "otherteam"]);
    expect(findInstagramHandles("<p>no links</p>")).toEqual([]);
  });
});

describe("plausibleTeamHandle", () => {
  it("accepts the team number, robotics words or a team-name word", () => {
    expect(plausibleTeamHandle("technototes_16750", 16750, "Technototes")).toBe(true);
    expect(plausibleTeamHandle("teamdroidforce", 23849, "Droid Force")).toBe(true);
    expect(plausibleTeamHandle("turpinators", 13798, "Turpinators")).toBe(true);
  });
  it("rejects school and district accounts", () => {
    expect(plausibleTeamHandle("tupelopublicschooldistrict", 12389, "Golden Wave")).toBe(false);
    expect(plausibleTeamHandle("kellywalshhs", 2836, "Kelly Walsh Robotics")).toBe(false);
  });
});

describe("findSubpages", () => {
  it("keeps same-site links, contact before about, shallow first", () => {
    const html = `
      <a href="/about/mentors">Mentors</a>
      <a href="/about">About</a>
      <a href="/contact-us">Contact</a>
      <a href="https://www.team.org/outreach">Reach out to us</a>
      <a href="/sponsors">Sponsors</a>
      <a href="https://other.org/contact">elsewhere</a>
      <a href="/about/flyer.pdf">About PDF</a>`;
    expect(findSubpages(html, "https://team.org/")).toEqual([
      "https://team.org/contact-us",
      "https://www.team.org/outreach",
      "https://team.org/about",
      "https://team.org/about/mentors",
    ]);
  });
});

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
    expect(parseInstagramHandle("https://www.instagram.com/invites/contact/?i=x")).toBeNull();
    expect(parseInstagramHandle("invites")).toBeNull();
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
