import { describe, expect, it } from "vitest";
import { shareable } from "./cache";

describe("shareable", () => {
  it("stores plain 200s only", () => {
    expect(shareable(new Response("ok"))).toBe(true);
    expect(shareable(new Response("x", { status: 404 }))).toBe(false);
  });

  it("never stores one visitor's response", () => {
    expect(shareable(new Response("ok", { headers: { "Set-Cookie": "a=1" } }))).toBe(false);
    expect(shareable(new Response("ok", { headers: { "Cache-Control": "private, no-store" } }))).toBe(false);
    expect(shareable(new Response("ok", { headers: { "Cache-Control": "no-store" } }))).toBe(false);
  });
});
