import {
  correctionFor,
  getSeason,
  isSeason,
  OFFICIAL_KINDS,
  type SeasonDescriptor,
  seasonLabel,
  weekOf,
} from "@ftcref/seasons";
import { Hono } from "hono";
import { raw } from "hono/html";
import { cached, VERSIONED_TTL } from "../cache";
import { db, type Env, matchLabel, matchSlug } from "../env";
import { eventJsonLd } from "../jsonld";
import { listWindow, slicePage } from "../paging";
import { isUsRegion, regionName } from "../regions";
import { f1, f2, fmtDateRange, Layout, Table, wlt } from "../views/layout";
import { Pager } from "../views/pager";
import {
  Av,
  CompTh,
  eventStatus,
  heatScale,
  OverHead,
  SeasonSelect,
  StatBox,
  StatusPill,
  TeamLinks,
  TeamName,
  Th,
  VidCell,
} from "../views/ui";

// ----------------------------------------------------------------------------- event types (FTCScout-style)

const KIND_LABELS: Record<string, string> = {
  Scrimmage: "Scrimmage",
  LeagueMeet: "League Meet",
  Qualifier: "Qualifier",
  LeagueTournament: "League Tournament",
  Championship: "Championship",
  FIRSTChampionship: "FIRST Championship",
  SuperQualifier: "Super Qualifier",
  Premier: "Premier",
  NonAdvancement: "Non-Advancement",
  Pilot: "Pilot",
  OffSeason: "Off-Season",
  Kickoff: "Kickoff",
  Workshop: "Workshop",
  DemoExhibition: "Demo / Exhibition",
  VolunteerSignup: "Volunteer Signup",
  PracticeDay: "Practice Day",
  InnovationChallenge: "Innovation Challenge",
  Other: "Other",
};
const COMPETITION = [
  "Scrimmage",
  "LeagueMeet",
  "Qualifier",
  "LeagueTournament",
  "Championship",
  "FIRSTChampionship",
  "SuperQualifier",
  "OffSeason",
  "Premier",
  "NonAdvancement",
  "Pilot",
];
const OFFICIAL: string[] = [...OFFICIAL_KINDS];
const NON_COMPETITION = [
  "Kickoff",
  "Workshop",
  "DemoExhibition",
  "VolunteerSignup",
  "PracticeDay",
  "InnovationChallenge",
  "Other",
];
const TYPE_GROUPS: Record<string, { label: string; kinds: string[] | null }> = {
  comp: { label: "Competitions", kinds: COMPETITION },
  official: { label: "Official", kinds: OFFICIAL },
  noncomp: { label: "Non-competition", kinds: NON_COMPETITION },
  all: { label: "All events", kinds: null },
};

interface EventListRow {
  code: string;
  name: string;
  kind: string | null;
  type_name: string | null;
  city: string | null;
  state_prov: string | null;
  country: string | null;
  region_code: string | null;
  remote: number;
  date_start: string;
  date_end: string;
  teams: number;
  played: number;
}

export const eventRoutes = new Hono<{ Bindings: Env }>();

eventRoutes.get("/:season{[0-9]{4}}", (c) => {
  const season = Number(c.req.param("season"));
  if (!isSeason(season)) return c.notFound();
  return cached(c, { ttl: 600 }, async () => {
    const desc = getSeason(season);
    const type = c.req.query("type") ?? "comp";
    const region = c.req.query("region") ?? "all";
    const format = c.req.query("format") ?? "all";
    const q = (c.req.query("q") ?? "").trim();
    const withResults = c.req.query("results") === "1";
    const withVideo = c.req.query("video") === "1";

    // Events FIRST no longer lists (cancelled/renamed) stay reachable by URL but drop off the list.
    const where = ["e.season = ?", "e.removed_at IS NULL"];
    const args: (string | number)[] = [season];
    const group = TYPE_GROUPS[type];
    const kinds = group ? group.kinds : KIND_LABELS[type] ? [type] : COMPETITION;
    if (kinds) {
      // Events with no type from the API count as competitions (older seasons occasionally omit it).
      const nullOk = kinds === COMPETITION ? " OR e.kind IS NULL" : "";
      where.push(`(e.kind IN (${kinds.map(() => "?").join(",")})${nullOk})`);
      args.push(...kinds);
    }
    if (region === "US") where.push("e.region_code LIKE 'US%'");
    else if (region === "INTL") where.push("(e.region_code IS NULL OR e.region_code NOT LIKE 'US%')");
    else if (region !== "all") {
      where.push("e.region_code = ?");
      args.push(region);
    }
    if (withResults) {
      where.push(
        "EXISTS (SELECT 1 FROM matches m WHERE m.season = e.season AND m.event_code = e.code AND m.played = 1)",
      );
    }
    if (format === "trad") where.push("e.remote = 0");
    else if (format === "remote") where.push("e.remote = 1");
    if (q) {
      where.push("(e.name LIKE ? OR e.city LIKE ? OR e.code LIKE ?)");
      const like = `%${q.replace(/[%_]/g, "")}%`;
      args.push(like, like, like);
    }

    const d = db(c);
    const [listR, regionsR, videosR] = await d.batch([
      d
        .prepare(
          `SELECT e.code, e.name, e.kind, e.type_name, e.city, e.state_prov, e.country, e.region_code, e.remote,
                  e.date_start, e.date_end,
                  (SELECT COUNT(*) FROM event_teams t WHERE t.season = e.season AND t.event_code = e.code) AS teams,
                  (SELECT COUNT(*) FROM matches m WHERE m.season = e.season AND m.event_code = e.code AND m.played = 1) AS played
           FROM events e WHERE ${where.join(" AND ")} ORDER BY e.date_start, e.name`,
        )
        .bind(...args),
      d
        .prepare("SELECT DISTINCT region_code FROM events WHERE season = ? AND region_code IS NOT NULL")
        .bind(season),
      d
        .prepare(
          `SELECT m.event_code, COUNT(*) AS n FROM videos v JOIN matches m ON m.id = v.match_id
           WHERE m.season = ? AND v.status = 'approved' GROUP BY m.event_code`,
        )
        .bind(season),
    ]);
    const videoCount = new Map(
      ((videosR?.results ?? []) as { event_code: string; n: number }[]).map((r) => [r.event_code, r.n]),
    );
    const events = ((listR?.results ?? []) as EventListRow[]).filter(
      (e) => !withVideo || videoCount.has(e.code),
    );
    const regions = ((regionsR?.results ?? []) as { region_code: string }[])
      .map((r) => r.region_code)
      .sort((a, b) => regionName(a).localeCompare(regionName(b)));
    const today = new Date().toISOString().slice(0, 10);
    const live = events.filter((e) => eventStatus(e.date_start, e.date_end, today) === "live").length;

    // Group into weeks counted from the Monday before kickoff (like FTCScout).
    const weeks = new Map<number, EventListRow[]>();
    for (const e of events) {
      const w = weekOf(desc, e.date_start);
      weeks.set(w, [...(weeks.get(w) ?? []), e]);
    }
    const { size, page: requested } = listWindow(c);
    const flat: { w: number; e: EventListRow }[] = [];
    for (const [w, es] of weeks) for (const e of es) flat.push({ w, e });
    // No ?page= means "where the season is now": this week, or the next week that has events.
    const weekNums = [...weeks.keys()];
    const here = weekNums.find((w) => w >= weekOf(desc, today)) ?? null;
    const hereAt = here == null ? -1 : flat.findIndex((row) => row.w === here);
    const opening = c.req.query("page") == null && hereAt >= 0;
    const pg = slicePage(flat, opening ? Math.floor(hereAt / size) + 1 : requested, size);
    const shown = new Map<number, EventListRow[]>();
    for (const row of pg.rows) {
      const list = shown.get(row.w);
      if (list) list.push(row.e);
      else shown.set(row.w, [row.e]);
    }
    const qs = (page?: number) => {
      const p = new URLSearchParams();
      if (type !== "comp") p.set("type", type);
      if (region !== "all") p.set("region", region);
      if (format !== "all") p.set("format", format);
      if (q) p.set("q", q);
      if (withResults) p.set("results", "1");
      if (withVideo) p.set("video", "1");
      // Page 1 stays in the query so Prev from page 2 doesn't bounce back to this week.
      if (page != null) p.set("page", String(page));
      const s = p.toString();
      return s ? `?${s}` : "";
    };
    const href = (p: number) => `/events/${season}${qs(p)}`;
    const auto = { onchange: "this.form.submit()" } as Record<string, string>;
    const filtered =
      type !== "comp" || region !== "all" || format !== "all" || !!q || withResults || withVideo;

    return c.html(
      <Layout
        title={`${seasonLabel(season)} ${desc.game} Events`}
        description={`FTC ${desc.game} events, ${seasonLabel(season)}: schedules, results and rankings.`}
      >
        <h1>
          {seasonLabel(season)} Events · {desc.game}
        </h1>
        <form class="filters" method="get">
          {/* biome-ignore lint/a11y/noLabelWithoutControl: SeasonSelect renders the select */}
          <label>
            Season
            <SeasonSelect current={season} href={(s) => `/events/${s}${qs()}`} />
          </label>
          <label>
            Event type
            <select name="type" {...auto}>
              <optgroup label="Groups">
                {Object.entries(TYPE_GROUPS).map(([k, g]) => (
                  <option value={k} selected={k === type}>
                    {g.label}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Competition types">
                {COMPETITION.map((k) => (
                  <option value={k} selected={k === type}>
                    {KIND_LABELS[k]}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Other">
                {NON_COMPETITION.map((k) => (
                  <option value={k} selected={k === type}>
                    {KIND_LABELS[k]}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>
          <label>
            Region
            <select name="region" {...auto}>
              <option value="all" selected={region === "all"}>
                All regions
              </option>
              <option value="US" selected={region === "US"}>
                United States
              </option>
              <option value="INTL" selected={region === "INTL"}>
                International
              </option>
              <optgroup label="United States">
                {regions.filter(isUsRegion).map((r) => (
                  <option value={r} selected={r === region}>
                    {regionName(r)}
                  </option>
                ))}
              </optgroup>
              <optgroup label="International">
                {regions
                  .filter((r) => !isUsRegion(r))
                  .map((r) => (
                    <option value={r} selected={r === region}>
                      {regionName(r)}
                    </option>
                  ))}
              </optgroup>
            </select>
          </label>
          {desc.hasRemote && (
            <label>
              Format
              <select name="format" {...auto}>
                <option value="all" selected={format === "all"}>
                  All
                </option>
                <option value="trad" selected={format === "trad"}>
                  Traditional
                </option>
                <option value="remote" selected={format === "remote"}>
                  Remote
                </option>
              </select>
            </label>
          )}
          <label>
            Search
            <input name="q" type="search" value={q} placeholder="Name, city or code" />
          </label>
          <label class="chk">
            <span>
              <input type="checkbox" name="results" value="1" checked={withResults} {...auto} /> Has results
            </span>
          </label>
          <label class="chk">
            <span>
              <input type="checkbox" name="video" value="1" checked={withVideo} {...auto} /> Has video
            </span>
          </label>
          <button type="submit" class="go">
            Filter
          </button>
          {filtered && <a href={`/events/${season}`}>Reset</a>}
        </form>
        <p class="sitestats">
          {events.length.toLocaleString("en-US")} event{events.length === 1 ? "" : "s"}
          {live > 0 && ` · ${live} live now`} · weeks counted from kickoff ({desc.kickoff}) · click a column
          to sort within each week
        </p>
        {events.length === 0 ? (
          <p class="note">No events match these filters.</p>
        ) : (
          <>
            <Pager
              page={pg.page}
              pages={pg.pages}
              total={pg.total}
              start={pg.start}
              size={pg.size}
              href={href}
            />
            <div class="scroll">
              <table class="st" style="width:100%">
                <thead>
                  <tr>
                    <th class="l">Dates</th>
                    <th class="l">Event</th>
                    <th>Teams</th>
                    <th title="Matches with results">Played</th>
                    <th class="l">Status</th>
                  </tr>
                </thead>
                {[...shown].map(([w, es]) => (
                  <tbody>
                    <tr class="wkh" id={opening && w === here ? "wk" : undefined}>
                      <th colspan={5}>
                        {w < 1 ? "Preseason" : `Week ${w}`}
                        <span>
                          {(() => {
                            const n = weeks.get(w)?.length ?? es.length;
                            return `${weekRange(desc, w)} · ${n} event${n === 1 ? "" : "s"}`;
                          })()}
                        </span>
                      </th>
                    </tr>
                    {es.map((e) => (
                      <tr
                        class={
                          e.played > 0
                            ? "has"
                            : eventStatus(e.date_start, e.date_end, today) === "final"
                              ? "nores"
                              : undefined
                        }
                      >
                        <td class="l" data-v={e.date_start}>
                          {fmtDateRange(e.date_start, e.date_end)}
                        </td>
                        <td class="l wrap">
                          <a class="ev" href={`/events/${season}/${e.code}`}>
                            {e.name}
                          </a>{" "}
                          {e.played > 0 && (
                            <span class="dot" title={`${e.played} matches with results`}>
                              ● results
                            </span>
                          )}{" "}
                          {videoCount.has(e.code) && (
                            <a
                              class="vtag"
                              href={`/events/${season}/${e.code}#matches`}
                              title={`${videoCount.get(e.code)} matches with video`}
                            >
                              ▶ video
                            </a>
                          )}{" "}
                          {e.remote ? <span class="pill">remote</span> : ""}
                          <div class="sub">
                            {(e.kind && KIND_LABELS[e.kind]) ?? e.type_name} ·{" "}
                            {[e.city, e.state_prov, e.country].filter(Boolean).join(", ")}
                          </div>
                        </td>
                        <td>{e.teams || ""}</td>
                        <td>{e.played || ""}</td>
                        <td class="l">
                          <StatusPill s={eventStatus(e.date_start, e.date_end, today)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                ))}
              </table>
            </div>
            {opening && (
              <script>
                {raw(
                  'var w=document.getElementById("wk");if(w&&w.getBoundingClientRect().top>innerHeight*0.35)w.scrollIntoView()',
                )}
              </script>
            )}
            <Pager
              page={pg.page}
              pages={pg.pages}
              total={pg.total}
              start={pg.start}
              size={pg.size}
              href={href}
            />
          </>
        )}
      </Layout>,
    );
  });
});

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function weekRange(desc: SeasonDescriptor, w: number) {
  const start = new Date(Date.parse(`${desc.kickoff}T00:00:00Z`));
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7) + (w - 1) * 7);
  const end = new Date(start.getTime() + 6 * 86_400_000);
  const f = (d: Date) => `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
  return `${f(start)} – ${f(end)}`;
}

// ----------------------------------------------------------------------------- event page

interface EventRow {
  season: number;
  code: string;
  name: string;
  type_name: string | null;
  venue: string | null;
  city: string | null;
  state_prov: string | null;
  country: string | null;
  date_start: string;
  date_end: string;
  region_code: string | null;
  league_code: string | null;
  live_stream_url: string | null;
  remote: number;
  removed_at: string | null;
}

interface MatchRow {
  id: number;
  level: string;
  series: number;
  match_number: number;
  red_score: number | null;
  blue_score: number | null;
  red_np: number | null;
  blue_np: number | null;
  winner: string | null;
  played: number;
  has_video: number;
  teams: string | null; // "Red1:123,Red2:456,…"
}

type Stat = Record<string, number | null> & { team: number; name_short: string | null; av: string | null };

eventRoutes.get("/:season{[0-9]{4}}/:code", (c) => {
  const season = Number(c.req.param("season"));
  if (!isSeason(season)) return c.notFound();
  const code = c.req.param("code").toUpperCase();
  return cached(c, { versions: [`event:${season}:${code}`], ttl: VERSIONED_TTL }, async () => {
    const desc = getSeason(season);
    const correction = correctionFor(season, code);
    const d = db(c);
    const [evR, rankR, matchR, statR, allyR, awardR, teamsR, streamR] = await d.batch([
      d.prepare("SELECT * FROM events WHERE season = ? AND code = ?").bind(season, code),
      d
        .prepare(
          `SELECT r.*, t.name_short, t.city, t.state_prov, t.country, t.home_region, s.opr_np, av.key AS av FROM rankings r
           LEFT JOIN teams t ON t.number = r.team
           LEFT JOIN team_avatars av ON av.team = r.team
           LEFT JOIN team_event_stats s ON s.season = r.season AND s.event_code = r.event_code AND s.team = r.team
           WHERE r.season = ? AND r.event_code = ? ORDER BY r.rank`,
        )
        .bind(season, code),
      d
        .prepare(
          `SELECT m.id, m.level, m.series, m.match_number, m.red_score, m.blue_score, m.red_np, m.blue_np,
                  m.winner, m.played,
                  EXISTS (SELECT 1 FROM videos v WHERE v.match_id = m.id AND v.status = 'approved') AS has_video,
                  (SELECT group_concat(station || ':' || team) FROM match_teams mt WHERE mt.match_id = m.id) AS teams
           FROM matches m WHERE m.season = ? AND m.event_code = ?
           ORDER BY CASE m.level WHEN 'Q' THEN 0 ELSE 1 END, m.series, m.match_number`,
        )
        .bind(season, code),
      d
        .prepare(
          `SELECT s.*, t.name_short, t.city, t.state_prov, t.country, t.home_region, av.key AS av FROM team_event_stats s
           LEFT JOIN teams t ON t.number = s.team
           LEFT JOIN team_avatars av ON av.team = s.team
           WHERE s.season = ? AND s.event_code = ? ORDER BY s.opr_np DESC`,
        )
        .bind(season, code),
      d
        .prepare("SELECT * FROM alliances WHERE season = ? AND event_code = ? ORDER BY number")
        .bind(season, code),
      d
        .prepare(
          `SELECT a.*, t.name_short, av.key AS av FROM awards a
           LEFT JOIN teams t ON t.number = a.team
           LEFT JOIN team_avatars av ON av.team = a.team
           WHERE a.season = ? AND a.event_code = ? ORDER BY a.award_id, a.series`,
        )
        .bind(season, code),
      d
        .prepare(
          `SELECT et.team, t.name_short, t.city, t.state_prov, t.country, t.home_region, av.key AS av FROM event_teams et
           LEFT JOIN teams t ON t.number = et.team
           LEFT JOIN team_avatars av ON av.team = et.team
           WHERE et.season = ? AND et.event_code = ? ORDER BY et.team`,
        )
        .bind(season, code),
      d
        .prepare(
          "SELECT day, video_id FROM event_streams WHERE season = ? AND event_code = ? AND provider = 'youtube' ORDER BY day",
        )
        .bind(season, code),
    ]);
    const streams = (streamR?.results ?? []) as { day: string; video_id: string }[];
    const ev = evR?.results[0] as EventRow | undefined;
    if (!ev) {
      return c.html(
        <Layout title="Event not found">
          <h1>Event {code} not found</h1>
          <p class="note">
            <a href={`/events/${season}`}>Browse {seasonLabel(season)} events</a>
          </p>
        </Layout>,
        404,
      );
    }
    const remote = !!ev.remote;

    type Rank = {
      team: number;
      name_short: string | null;
      av: string | null;
      rank: number;
      wins: number;
      losses: number;
      ties: number;
      played: number;
      sort1: number;
      sort2: number;
      sort3: number;
      opr_np: number | null;
    };
    const ranks = (rankR?.results ?? []) as Rank[];
    const matches = (matchR?.results ?? []) as MatchRow[];
    const stats = (statR?.results ?? []) as unknown as Stat[];
    const allys = (allyR?.results ?? []) as {
      number: number;
      captain: number | null;
      pick1: number | null;
      pick2: number | null;
      backup: number | null;
    }[];
    const awards = (awardR?.results ?? []) as {
      name: string;
      team: number;
      name_short: string | null;
      av: string | null;
      person_name: string | null;
    }[];
    const roster = new Map(((teamsR?.results ?? []) as RosterTeam[]).map((t) => [t.team, t]));

    const played = matches.filter((m) => m.played);
    let high: { np: number; m: MatchRow } | null = null;
    for (const m of played) {
      for (const np of [m.red_np, m.blue_np]) if (np != null && (!high || np > high.np)) high = { np, m };
    }
    const nps = played
      .filter((m) => m.level === "Q")
      .flatMap((m) => [m.red_np, m.blue_np])
      .filter((x): x is number => x != null);
    const avgNp = nps.length ? nps.reduce((a, b) => a + b, 0) / nps.length : null;
    const status = eventStatus(ev.date_start, ev.date_end);

    const rankHeat = heatScale(ranks.map((r) => r.opr_np));
    /** `g`: the over-header group. Remote events have no OPR, only per-team averages. */
    type Col = {
      k: string;
      g: string;
      head: unknown;
      fmt: (x: number | null) => string | number;
      invert?: boolean;
    };
    const pts = remote ? "Points per match" : "Points added per match (OPR)";
    const elems = remote ? `${desc.game} scoring` : `${desc.game} scoring (OPR)`;
    const statCols: Col[] = [
      { k: "opr_np", g: pts, head: <Th k="NP OPR" label={remote ? "Avg NP" : "NP OPR"} />, fmt: f1 },
      { k: "opr_auto", g: pts, head: <Th k="Auto" />, fmt: f1 },
      { k: "opr_teleop", g: pts, head: <Th k="TeleOp" />, fmt: f1 },
      { k: "opr_endgame", g: pts, head: <Th k="Endgame" />, fmt: f1 },
      ...desc.components.map((comp) => ({
        k: `opr_${comp.key}`,
        g: elems,
        head: <CompTh c={comp} />,
        fmt: comp.count ? f2 : f1,
      })),
      ...(remote
        ? []
        : [
            { k: "dpr", g: "Defense", head: <Th k="DPR" />, fmt: f1, invert: true },
            { k: "ccwm", g: "Defense", head: <Th k="CCWM" />, fmt: f1 },
          ]),
      { k: "avg_np", g: "Alliance score", head: <Th k="Avg NP" />, fmt: f1 },
      { k: "max_np", g: "Alliance score", head: <Th k="Max NP" />, fmt: (x) => x ?? "" },
    ];
    const heats = Object.fromEntries(
      statCols.map((s) => [
        s.k,
        heatScale(
          stats.map((x) => x[s.k]),
          s.invert,
        ),
      ]),
    );

    return c.html(
      <Layout
        title={`${ev.name} (${seasonLabel(season)})`}
        description={`Rankings, match results and OPR for ${ev.name}, ${seasonLabel(season)} ${desc.game}.`}
        jsonLd={eventJsonLd(ev, desc.game, seasonLabel(season))}
      >
        <div class="crumbs">
          <a href={`/events/${season}`}>
            {seasonLabel(season)} {desc.game}
          </a>{" "}
          › {code}
        </div>
        <h1>
          {ev.name} <StatusPill s={status} /> {remote && <span class="pill">remote</span>}
        </h1>
        <div class="bio">
          <div>
            <b>Dates:</b> {fmtDateRange(ev.date_start, ev.date_end)}
          </div>
          <div>
            <b>Type:</b> {ev.type_name}
          </div>
          <div>
            <b>Location:</b> {[ev.venue, ev.city, ev.state_prov, ev.country].filter(Boolean).join(", ")}
          </div>
          {ev.region_code && (
            <div>
              <b>Region:</b> {regionName(ev.region_code)}
            </div>
          )}
          {ev.league_code && (
            <div>
              <b>League:</b> {ev.region_code}-{ev.league_code}
            </div>
          )}
          {ev.live_stream_url && (
            <div>
              <a href={ev.live_stream_url}>Livestream</a>
            </div>
          )}
          {streams.map((st, i) => (
            <div>
              <a href={`https://www.youtube.com/watch?v=${st.video_id}`}>
                {streams.length > 1 ? `Stream day ${i + 1} (${st.day})` : "Event stream"}
              </a>
            </div>
          ))}
          <div>
            <a href={`https://ftc-events.firstinspires.org/${season}/${code}`}>FIRST event page</a>
          </div>
        </div>
        {ev.removed_at && (
          <p class="note">
            FIRST no longer lists this event (cancelled or renamed) as of {ev.removed_at.slice(0, 10)}, so it
            is no longer synced.
          </p>
        )}
        {correction && (
          <p class="note">
            * Scores here are corrected, not as reported. {correction.note} OPRs use the corrected scores.
          </p>
        )}
        <div class="sbr">
          <StatBox label="Teams" value={roster.size || ranks.length || "–"} />
          <StatBox label="Matches" value={played.length} sub={`of ${matches.length} scheduled`} />
          <StatBox
            label={remote ? "High score" : "High score (NP)"}
            value={high ? high.np : "–"}
            sub={
              high && (
                <a
                  href={`/events/${season}/${code}/${matchSlug(high.m.level, high.m.series, high.m.match_number)}`}
                >
                  {remote ? `${high.m.series} ` : ""}
                  {matchLabel(high.m.level, remote ? 0 : high.m.series, high.m.match_number)}
                </a>
              )
            }
          />
          <StatBox
            label={remote ? "Avg score" : "Avg qual NP"}
            value={avgNp == null ? "–" : avgNp.toFixed(1)}
            tip="Average no-penalty score in qualification matches"
          />
          {stats[0] && (
            <StatBox
              label={remote ? "Top average" : "Top NP OPR"}
              value={f1(stats[0].opr_np)}
              sub={<a href={`/teams/${stats[0].team}?season=${season}`}>{stats[0].team}</a>}
            />
          )}
        </div>
        <div class="tabs">
          <a href="#rankings">Rankings</a>
          <a href="#matches">Matches</a>
          {ranks.length === 0 && roster.size > 0 && <a href="#teams">Teams</a>}
          {!remote && <a href="#bracket">Bracket</a>}
          <a href="#stats">Team Stats</a>
          {!remote && <a href="#alliances">Alliances</a>}
          <a href="#awards">Awards</a>
        </div>

        <h2 id="rankings">Rankings</h2>
        {ranks.length === 0 ? (
          <p class="note">No rankings yet.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th k="Rk" />
                <th>Team</th>
                <th class="l">Name</th>
                {!remote && <Th k="W-L-T" />}
                <Th k="RS" />
                <Th k="TB1" />
                <Th k="TB2" />
                <Th k="Pl" />
                <Th k="NP OPR" label={remote ? "Avg NP" : "NP OPR"} />
              </tr>
            </thead>
            <tbody>
              {ranks.map((r) => (
                <tr>
                  <td>{r.rank}</td>
                  <td>
                    <a href={`/teams/${r.team}?season=${season}`}>{r.team}</a>
                  </td>
                  <td class="l">
                    <TeamName team={r.team} name={r.name_short} av={r.av} loc={r as never} />
                  </td>
                  {!remote && <td data-v={r.wins + r.ties / 2}>{wlt(r.wins, r.losses, r.ties)}</td>}
                  <td>{f2(r.sort1)}</td>
                  <td>{f2(r.sort2)}</td>
                  <td>{f2(r.sort3)}</td>
                  <td>{r.played}</td>
                  <td class="ht" style={rankHeat(r.opr_np)}>
                    {f1(r.opr_np)}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}

        {ranks.length === 0 && roster.size > 0 && (
          <>
            <h2 id="teams">Registered Teams ({roster.size})</h2>
            <Table>
              <thead>
                <tr>
                  <th>Team</th>
                  <th class="l">Name</th>
                  <th class="l">Location</th>
                </tr>
              </thead>
              <tbody>
                {[...roster.values()].map((t) => (
                  <tr>
                    <td>
                      <a href={`/teams/${t.team}?season=${season}`}>{t.team}</a>
                    </td>
                    <td class="l">
                      <TeamName team={t.team} name={t.name_short} av={t.av} loc={t} />
                    </td>
                    <td class="l wrap">{[t.city, t.state_prov, t.country].filter(Boolean).join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </>
        )}

        <h2 id="matches">Matches</h2>
        {matches.length === 0 ? (
          <p class="note">Schedule not published yet.</p>
        ) : remote ? (
          <RemoteMatchTable
            season={season}
            code={code}
            matches={matches}
            roster={roster}
            high={high?.np ?? null}
          />
        ) : (
          <MatchTable season={season} code={code} matches={matches} roster={roster} high={high?.np ?? null} />
        )}

        {!remote && (
          <>
            <h2 id="bracket">Playoff Bracket</h2>
            <Bracket season={season} code={code} matches={matches} allys={allys} />
          </>
        )}

        <h2 id="stats">Team Stats</h2>
        {stats.length === 0 ? (
          <p class="note">Stats appear after the first scored qualification match.</p>
        ) : (
          <>
            <p class="note">
              {remote
                ? "Remote event: each team plays alone, so these are per-team averages."
                : "OPR = points a team adds per match (least-squares over qualification matches)."}{" "}
              Shaded cells are above the event median; darker is better. Hover a header for its definition.
            </p>
            <Table>
              <thead>
                <OverHead lead={remote ? 1 : 2} groups={statCols.map((s) => s.g)} />
                <tr>
                  <th class="l">Team</th>
                  {!remote && <Th k="W-L-T" />}
                  {statCols.map((s) => s.head)}
                </tr>
              </thead>
              <tbody>
                {stats.map((s) => (
                  <tr>
                    <td class="l" data-v={s.team}>
                      <TeamName
                        team={s.team}
                        name={s.name_short}
                        av={s.av}
                        num
                        season={season}
                        loc={s as never}
                      />
                    </td>
                    {!remote && <td data-v={s.wins}>{wlt(s.wins ?? 0, s.losses ?? 0, s.ties ?? 0)}</td>}
                    {statCols.map((col) => (
                      <td class={`ht${col.k === "opr_np" ? " w" : ""}`} style={heats[col.k]?.(s[col.k])}>
                        {col.fmt(s[col.k] ?? null)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </Table>
          </>
        )}

        {!remote && (
          <>
            <h2 id="alliances">Alliances</h2>
            {allys.length === 0 ? (
              <p class="note">Alliance selection has not happened yet.</p>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th class="l">Captain</th>
                    <th class="l">Pick 1</th>
                    <th class="l">Pick 2</th>
                    <th class="l">Backup</th>
                  </tr>
                </thead>
                <tbody>
                  {allys.map((a) => (
                    <tr>
                      <td>{a.number}</td>
                      {[a.captain, a.pick1, a.pick2, a.backup].map((t) => (
                        <td class="l">
                          {t ? (
                            <>
                              <Av team={t} k={roster.get(t)?.av} />
                              <a href={`/teams/${t}?season=${season}`}>{t}</a>{" "}
                              <span class="note">{roster.get(t)?.name_short}</span>
                            </>
                          ) : (
                            ""
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </>
        )}

        <h2 id="awards">Awards</h2>
        {awards.length === 0 ? (
          <p class="note">No awards posted.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <th class="l">Award</th>
                <th>Team</th>
                <th class="l">Name</th>
              </tr>
            </thead>
            <tbody>
              {awards.map((a) => (
                <tr>
                  <td class="l">{a.name}</td>
                  <td>{a.team ? <a href={`/teams/${a.team}?season=${season}`}>{a.team}</a> : ""}</td>
                  <td class="l">
                    {a.person_name ??
                      (a.team ? <TeamName team={a.team} name={a.name_short} av={a.av} /> : "")}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Layout>,
    );
  });
});

interface RosterTeam {
  team: number;
  name_short: string | null;
  av: string | null;
  city: string | null;
  state_prov: string | null;
  country: string | null;
  home_region: string | null;
}
type Roster = Map<number, RosterTeam>;

function MatchTable(props: {
  season: number;
  code: string;
  matches: MatchRow[];
  roster: Roster;
  high: number | null;
}) {
  const side = (teams: string, ally: "Red" | "Blue") =>
    teams
      .split(",")
      .filter((s) => s.startsWith(ally))
      .sort()
      .map((s) => {
        const team = Number(s.split(":")[1]);
        return { team, av: props.roster.get(team)?.av };
      });
  const npHeat = heatScale(props.matches.flatMap((m) => [m.red_np, m.blue_np]));
  const firstPlayoff = props.matches.findIndex((m) => m.level !== "Q");
  const hi = (np: number | null) => (props.high != null && np === props.high ? " top" : "");
  return (
    <Table>
      <thead>
        <tr>
          <th class="vc" title="Video" />
          <th class="l">Match</th>
          <th class="l">Red</th>
          <th class="l">Blue</th>
          <th>Red</th>
          <th>Blue</th>
          <th title="Red no-penalty score">Red NP</th>
          <th title="Blue no-penalty score">Blue NP</th>
        </tr>
      </thead>
      <tbody>
        {props.matches.map((m, i) => {
          const href = `/events/${props.season}/${props.code}/${matchSlug(m.level, m.series, m.match_number)}`;
          return (
            <tr class={i > 0 && i === firstPlayoff ? "sep" : undefined}>
              <VidCell href={href} has={m.has_video} />
              <td class="l" data-v={(m.level === "Q" ? 0 : 1000) + m.series * 10 + m.match_number}>
                <a href={href}>{matchLabel(m.level, m.series, m.match_number)}</a>
              </td>
              <td class="l r">
                <TeamLinks teams={side(m.teams ?? "", "Red")} season={props.season} />
              </td>
              <td class="l b">
                <TeamLinks teams={side(m.teams ?? "", "Blue")} season={props.season} />
              </td>
              <td class={`r${m.winner === "R" ? " w" : ""}${hi(m.red_np)}`}>{m.played ? m.red_score : ""}</td>
              <td class={`b${m.winner === "B" ? " w" : ""}${hi(m.blue_np)}`}>
                {m.played ? m.blue_score : ""}
              </td>
              <td class="ht" style={npHeat(m.red_np)}>
                {m.red_np ?? ""}
              </td>
              <td class="ht" style={npHeat(m.blue_np)}>
                {m.blue_np ?? ""}
              </td>
            </tr>
          );
        })}
      </tbody>
    </Table>
  );
}

/**
 * Double-elimination bracket derived from the played data (no hard-coded bracket shape): each
 * playoff match is placed by which alliances play it. A match is "lower bracket" once either
 * alliance already has a loss; its column is how many matches the busier alliance has played.
 */
function Bracket(props: {
  season: number;
  code: string;
  matches: MatchRow[];
  allys: {
    number: number;
    captain: number | null;
    pick1: number | null;
    pick2: number | null;
    backup: number | null;
  }[];
}) {
  const playoffs = props.matches.filter((m) => m.level !== "Q");
  if (playoffs.length === 0) return <p class="note">Playoffs have not been scheduled yet.</p>;
  const allyOf = new Map<number, number>();
  for (const a of props.allys)
    for (const t of [a.captain, a.pick1, a.pick2, a.backup]) if (t) allyOf.set(t, a.number);
  const sideAlly = (teams: string | null, prefix: string) => {
    for (const s of (teams ?? "").split(",")) {
      if (s.startsWith(prefix)) {
        const a = allyOf.get(Number(s.split(":")[1]));
        if (a) return a;
      }
    }
    return null;
  };
  const losses = new Map<number, number>();
  const stage = new Map<number, number>();
  type Node = {
    m: MatchRow;
    red: number | null;
    blue: number | null;
    sec: "Upper" | "Lower" | "Final";
    col: number;
  };
  const nodes: Node[] = [];
  for (const m of playoffs) {
    const red = sideAlly(m.teams, "Red");
    const blue = sideAlly(m.teams, "Blue");
    const lower =
      (red != null && (losses.get(red) ?? 0) > 0) || (blue != null && (losses.get(blue) ?? 0) > 0);
    const col = Math.max(red != null ? (stage.get(red) ?? 0) : 0, blue != null ? (stage.get(blue) ?? 0) : 0);
    nodes.push({ m, red, blue, sec: m.level === "F" ? "Final" : lower ? "Lower" : "Upper", col });
    for (const a of [red, blue]) if (a != null) stage.set(a, col + 1);
    if (m.played && m.winner && m.winner !== "T") {
      const loser = m.winner === "R" ? blue : red;
      if (loser != null) losses.set(loser, (losses.get(loser) ?? 0) + 1);
    }
  }
  const section = (sec: Node["sec"]) => {
    const ns = nodes.filter((n) => n.sec === sec);
    const cols = [...new Set(ns.map((n) => n.col))].sort((a, b) => a - b);
    return (
      <>
        <h3 style="font-size:13px;margin:8px 0 2px">{sec === "Final" ? "Finals" : `${sec} bracket`}</h3>
        <div class="bk">
          {cols.map((c, ci) => (
            <div class="col">
              <h4>Round {ci + 1}</h4>
              {ns
                .filter((n) => n.col === c)
                .map((n) => {
                  const href = `/events/${props.season}/${props.code}/${matchSlug(n.m.level, n.m.series, n.m.match_number)}`;
                  const row = (ally: number | null, cls: "r" | "b", score: number | null, won: boolean) => (
                    <div class={`a ${cls}${won ? " w" : ""}`}>
                      <span>{ally ? `Alliance ${ally}` : "TBD"}</span>
                      <span>{n.m.played ? score : ""}</span>
                    </div>
                  );
                  return (
                    <a class="bm" href={href} style="display:block;color:inherit">
                      <div class="h">
                        <span>{matchLabel(n.m.level, n.m.series, n.m.match_number)}</span>
                        {n.m.has_video ? <span>▶</span> : null}
                      </div>
                      {row(n.red, "r", n.m.red_score, n.m.winner === "R")}
                      {row(n.blue, "b", n.m.blue_score, n.m.winner === "B")}
                    </a>
                  );
                })}
            </div>
          ))}
        </div>
      </>
    );
  };
  return (
    <>
      {section("Upper")}
      {nodes.some((n) => n.sec === "Lower") && section("Lower")}
      {nodes.some((n) => n.sec === "Final") && section("Final")}
    </>
  );
}

/** Remote events: every team plays its own matches; `series` holds the team number. */
function RemoteMatchTable(props: {
  season: number;
  code: string;
  matches: MatchRow[];
  roster: Roster;
  high: number | null;
}) {
  const heat = heatScale(props.matches.map((m) => m.red_np));
  return (
    <Table>
      <thead>
        <tr>
          <th class="vc" title="Video" />
          <th class="l">Match</th>
          <th>Team</th>
          <th class="l">Name</th>
          <th>Score</th>
          <th title="Score before penalty deductions">NP</th>
        </tr>
      </thead>
      <tbody>
        {props.matches.map((m) => {
          const href = `/events/${props.season}/${props.code}/${matchSlug(m.level, m.series, m.match_number)}`;
          return (
            <tr>
              <VidCell href={href} has={m.has_video} />
              <td class="l" data-v={m.match_number}>
                <a href={href}>{matchLabel(m.level, 0, m.match_number)}</a>
              </td>
              <td>
                <a href={`/teams/${m.series}?season=${props.season}`}>{m.series}</a>
              </td>
              <td class="l">
                <TeamName
                  team={m.series}
                  name={props.roster.get(m.series)?.name_short}
                  av={props.roster.get(m.series)?.av}
                />
              </td>
              <td class={props.high != null && m.red_np === props.high ? "top" : undefined}>
                {m.played ? m.red_score : ""}
              </td>
              <td class="ht" style={heat(m.red_np)}>
                {m.red_np ?? ""}
              </td>
            </tr>
          );
        })}
      </tbody>
    </Table>
  );
}
