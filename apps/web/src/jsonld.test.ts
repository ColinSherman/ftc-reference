import { describe, expect, it } from "vitest";
import { eventJsonLd, ldScript, teamJsonLd } from "./jsonld";

const ev = {
  season: 2026,
  code: "USCAFFL1",
  name: "Fall <Qualifier>",
  venue: "High School",
  city: "Fresno",
  state_prov: "CA",
  country: "USA",
  date_start: "2026-10-17T00:00:00",
  date_end: "2026-10-18T00:00:00",
  remote: 0,
};

type Loc = {
  "@type": string;
  startDate: string;
  url: string;
  location: { "@type": string; address: { addressRegion: string } };
};

describe("jsonld", () => {
  it("describes an in-person event as a SportsEvent with a Place", () => {
    const j = eventJsonLd(ev, "BIOBUZZ", "2026–27") as Loc;
    expect(j["@type"]).toBe("SportsEvent");
    expect(j.startDate).toBe("2026-10-17");
    expect(j.location["@type"]).toBe("Place");
    expect(j.location.address.addressRegion).toBe("CA");
    expect(j.url).toBe("https://ftc-reference.com/events/2026/USCAFFL1");
  });
  it("uses a VirtualLocation for remote events", () => {
    const j = eventJsonLd({ ...ev, remote: 1 }, "BIOBUZZ", "2026–27") as Loc;
    expect(j.location["@type"]).toBe("VirtualLocation");
  });
  it("describes a team and omits missing fields", () => {
    const j = teamJsonLd({
      number: 4201,
      name_short: "Vitruvian Bots",
      school: null,
      city: null,
      state_prov: null,
      country: null,
      rookie_year: 2012,
    });
    expect(j).toMatchObject({
      "@type": "SportsTeam",
      name: "FTC Team 4201 Vitruvian Bots",
      foundingDate: "2012",
    });
    expect(j).not.toHaveProperty("location");
    expect(j).not.toHaveProperty("parentOrganization");
  });
  it("escapes < so data can't close the script tag", () => {
    expect(ldScript(eventJsonLd(ev, "G", "S"))).not.toContain("<");
  });
});
