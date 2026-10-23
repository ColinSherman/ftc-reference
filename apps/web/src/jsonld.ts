/** schema.org structured data for event and team pages (rendered as JSON-LD by Layout). */

/** Production origin: structured data URLs are absolute, and staging is noindexed anyway. */
const SITE = "https://ftc-reference.com";
const SPORT = "FIRST Tech Challenge";

type Json = Record<string, unknown>;

const compact = (o: Json): Json =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v != null && v !== ""));

const address = (city?: string | null, region?: string | null, country?: string | null) =>
  city || region || country
    ? compact({
        "@type": "PostalAddress",
        addressLocality: city,
        addressRegion: region,
        addressCountry: country,
      })
    : undefined;

export function eventJsonLd(
  ev: {
    season: number;
    code: string;
    name: string;
    venue: string | null;
    city: string | null;
    state_prov: string | null;
    country: string | null;
    date_start: string;
    date_end: string;
    remote: number;
  },
  game: string,
  seasonName: string,
): Json {
  const url = `${SITE}/events/${ev.season}/${encodeURIComponent(ev.code)}`;
  return compact({
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    name: ev.name,
    description: `${seasonName} ${game} FIRST Tech Challenge event: rankings, match results and OPR.`,
    url,
    sport: SPORT,
    startDate: ev.date_start.slice(0, 10),
    endDate: ev.date_end.slice(0, 10),
    eventAttendanceMode: ev.remote
      ? "https://schema.org/OnlineEventAttendanceMode"
      : "https://schema.org/OfflineEventAttendanceMode",
    location: ev.remote
      ? { "@type": "VirtualLocation", url }
      : compact({
          "@type": "Place",
          name: ev.venue ?? ev.name,
          address: address(ev.city, ev.state_prov, ev.country),
        }),
  });
}

export function teamJsonLd(t: {
  number: number;
  name_short: string | null;
  school: string | null;
  city: string | null;
  state_prov: string | null;
  country: string | null;
  rookie_year: number | null;
}): Json {
  return compact({
    "@context": "https://schema.org",
    "@type": "SportsTeam",
    name: `FTC Team ${t.number}${t.name_short ? ` ${t.name_short}` : ""}`,
    identifier: String(t.number),
    url: `${SITE}/teams/${t.number}`,
    sport: SPORT,
    foundingDate: t.rookie_year ? String(t.rookie_year) : undefined,
    location: address(t.city, t.state_prov, t.country),
    parentOrganization: t.school ? { "@type": "Organization", name: t.school } : undefined,
  });
}

/** JSON for an inline <script>: `<` is escaped so page data can't close the tag. */
export const ldScript = (o: Json) => JSON.stringify(o).replace(/</g, "\\u003c");
