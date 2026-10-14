import { describe, expect, it } from "vitest";
import { isDue, type PlanRow } from "./planner";

const now = new Date("2026-10-17T20:00:00Z"); // 1pm in Los Angeles
const ago = (min: number) => new Date(now.getTime() - min * 60_000).toISOString();
const ev = (p: Partial<PlanRow>): PlanRow => ({
  code: "X",
  timezone: "America/Los_Angeles",
  date_start: "2026-10-17T00:00:00",
  date_end: "2026-10-17T00:00:00",
  last_checked_at: null,
  last_changed_at: null,
  ...p,
});

describe("isDue", () => {
  it("polls a live event every minute while matches are flowing", () => {
    expect(isDue(ev({ last_checked_at: ago(1), last_changed_at: ago(3) }), now)).toBe(true);
  });
  it("backs off to 5 minutes when a live event is quiet", () => {
    expect(isDue(ev({ last_checked_at: ago(2), last_changed_at: ago(45) }), now)).toBe(false);
    expect(isDue(ev({ last_checked_at: ago(5), last_changed_at: ago(45) }), now)).toBe(true);
  });
  it("polls hourly after the event ends and never before it starts", () => {
    const past = { date_start: "2026-10-16T00:00:00", date_end: "2026-10-16T00:00:00" };
    expect(isDue(ev({ ...past, last_checked_at: ago(30) }), now)).toBe(false);
    expect(isDue(ev({ ...past, last_checked_at: ago(61) }), now)).toBe(true);
    expect(isDue(ev({ date_start: "2026-10-18T00:00:00", date_end: "2026-10-18T00:00:00" }), now)).toBe(
      false,
    );
  });
  it("uses the event's local date, not UTC", () => {
    // 03:00Z on the 18th is still the 17th in Los Angeles.
    expect(isDue(ev({}), new Date("2026-10-18T03:00:00Z"))).toBe(true);
  });
});
