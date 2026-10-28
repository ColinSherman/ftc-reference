import { Hono } from "hono";
import { db, type Env, SEASON } from "../env";

export const suggestRoutes = new Hono<{ Bindings: Env }>();

/** Event kinds nobody searches for; leaving them out keeps the index small. */
const SKIP_KINDS = [
  "Kickoff",
  "Workshop",
  "DemoExhibition",
  "VolunteerSignup",
  "PracticeDay",
  "InnovationChallenge",
];
/**
 * Teams registered in the last four seasons and events from the last three: what people look for, at
 * ~60 KB over the wire. Older ones are a keypress away on /search.
 */
const TEAM_SEASONS = 4;
const EVENT_SEASONS = 3;
/** The edge copy is rebuilt once a day per data center (tens of thousands of rows read); browsers keep theirs a few hours. */
const EDGE_TTL = 86_400;
const BROWSER_TTL = 6 * 3600;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** [number, name, place, last season registered] */
export type TeamEntry = [number, string, string, number];
/** [season, code, name, "date · place"] */
export type EventEntry = [number, string, string, string];
export interface SearchIndex {
  t: TeamEntry[];
  e: EventEntry[];
}

type TeamRow = {
  number: number;
  /** Last season registered. */
  season: number;
  name_short: string | null;
  city: string | null;
  state_prov: string | null;
  country: string | null;
};
type EventRow = {
  season: number;
  code: string;
  name: string;
  city: string | null;
  state_prov: string | null;
  date_start: string;
};

const place = (...parts: (string | null)[]) => parts.filter(Boolean).join(", ");

/** "2025-11-08…" → "Nov 8, 2025" */
const day = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number) as [number, number, number];
  return `${MONTHS[m - 1]} ${d}, ${y}`;
};

/** Compact arrays rather than objects: the whole index is one fetch, so every byte is paid by every user. */
export function searchIndex(teams: TeamRow[], events: EventRow[]): SearchIndex {
  return {
    t: teams.map((t) => [
      t.number,
      t.name_short ?? "",
      place(t.city, t.state_prov, t.country === "USA" ? null : t.country),
      t.season,
    ]),
    e: events.map((e) => [
      e.season,
      e.code,
      e.name,
      [day(e.date_start), place(e.city, e.state_prov)].filter(Boolean).join(" · "),
    ]),
  };
}

// Header autosuggest data. Search runs in the browser, so typing never touches D1.
suggestRoutes.get("/search-index.json", async (c) => {
  const live = c.env.DEV !== "1";
  const key = new Request(
    `${new URL(c.req.url).origin}/search-index.json?__d=${c.env.CF_VERSION?.id ?? "dev"}`,
  );
  if (live) {
    const hit = await caches.default.match(key);
    if (hit) return hit;
  }
  const d = db(c);
  const [teamsR, eventsR] = await d.batch([
    d
      .prepare(
        `SELECT t.number, t.name_short, t.city, t.state_prov, t.country, a.season
         FROM (SELECT number, MAX(season) AS season FROM team_seasons WHERE season > ? GROUP BY number) a
         CROSS JOIN teams t ON t.number = a.number ORDER BY t.number`,
      )
      .bind(SEASON - TEAM_SEASONS),
    d
      .prepare(
        `SELECT season, code, name, city, state_prov, date_start FROM events
         WHERE season > ? AND removed_at IS NULL
           AND (kind IS NULL OR kind NOT IN (${SKIP_KINDS.map(() => "?").join(",")}))
         ORDER BY season DESC, date_start DESC`,
      )
      .bind(SEASON - EVENT_SEASONS, ...SKIP_KINDS),
  ]);
  const body = JSON.stringify(
    searchIndex((teamsR?.results ?? []) as TeamRow[], (eventsR?.results ?? []) as EventRow[]),
  );
  const res = new Response(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": `public, max-age=${BROWSER_TTL}, s-maxage=${EDGE_TTL}`,
    },
  });
  if (live) c.executionCtx.waitUntil(caches.default.put(key, res.clone()));
  return res;
});
