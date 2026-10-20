import {
  ALL_SEASONS,
  correctedStat,
  getSeason,
  isSeason,
  SEASONS,
  seasonKindIn,
  seasonLabel,
} from "@ftcref/seasons";
import { Hono } from "hono";
import { cached } from "../cache";
import { db, type Env, matchLabel, matchSlug, SEASON } from "../env";
import { listWindow } from "../paging";
import { seasonStatsTable, statsMode } from "../statsScope";
import { f1, f2, fmtDateRange, Layout, Table, wlt } from "../views/layout";
import { Pager } from "../views/pager";
import {
  Adj,
  AdjNote,
  Box,
  eventStatus,
  heatScale,
  SeasonSelect,
  StatusPill,
  TeamLinks,
  TeamName,
  Th,
  VidCell,
} from "../views/ui";

export const homeRoutes = new Hono<{ Bindings: Env }>();

homeRoutes.get("/", (c) =>
  cached(c, { ttl: 60 }, async () => {
    const d = db(c);
    const mode = statsMode(c);
    const table = seasonStatsTable(mode);
    const counted = mode === "official" ? `AND ${seasonKindIn("e")}` : "";
    const desc = getSeason(SEASON);
    const today = new Date().toISOString().slice(0, 10);
    const [countsR, evR, topR, autoR, highR, inspireR] = await d.batch([
      d
        .prepare(
          `SELECT (SELECT COUNT(*) FROM events WHERE season = ?1) AS events,
                  (SELECT COUNT(*) FROM team_seasons WHERE season = ?1) AS teams,
                  (SELECT COUNT(*) FROM matches WHERE season = ?1 AND played = 1) AS matches`,
        )
        .bind(SEASON),
      d
        .prepare(
          `SELECT e.code, e.name, e.city, e.state_prov, e.country, e.date_start, e.date_end, e.live_stream_url,
                  (SELECT COUNT(*) FROM matches m WHERE m.season = e.season AND m.event_code = e.code AND m.played = 1) AS played,
                  (SELECT COUNT(*) FROM event_teams t WHERE t.season = e.season AND t.event_code = e.code) AS teams,
                  (SELECT COUNT(DISTINCT v.match_id) FROM videos v JOIN matches mv ON mv.id = v.match_id
                    WHERE mv.season = e.season AND mv.event_code = e.code AND v.status = 'approved') AS videos,
                  (SELECT COUNT(*) FROM event_streams es WHERE es.season = e.season AND es.event_code = e.code) AS streams,
                  CASE WHEN e.webcasts_json IS NOT NULL AND e.webcasts_json NOT IN ('', '[]') THEN 1 ELSE 0 END AS webcast
           FROM events e
           WHERE e.season = ? AND substr(e.date_end, 1, 10) >= date(?, '-3 days') AND substr(e.date_start, 1, 10) <= date(?, '+7 days')
             AND (e.kind IS NULL OR e.kind NOT IN ('Kickoff','Workshop','DemoExhibition','VolunteerSignup','PracticeDay'))`,
        )
        .bind(SEASON, today, today),
      d
        .prepare(
          `SELECT s.team, t.name_short, t.city, t.state_prov, t.country, t.home_region, av.key AS av, s.best_opr_np, s.best_event, s.wins, s.losses, s.ties
           FROM ${table} s LEFT JOIN teams t ON t.number = s.team LEFT JOIN team_avatars av ON av.team = s.team
           WHERE s.season = ? AND s.best_opr_np IS NOT NULL ORDER BY s.best_opr_np DESC LIMIT ${HOME_STAT}`,
        )
        .bind(SEASON),
      d
        .prepare(
          `SELECT s.team, t.name_short, t.city, t.state_prov, t.country, t.home_region, av.key AS av, s.best_opr_auto, s.best_opr_c1
           FROM ${table} s LEFT JOIN teams t ON t.number = s.team LEFT JOIN team_avatars av ON av.team = s.team
           WHERE s.season = ? AND s.best_opr_auto IS NOT NULL ORDER BY s.best_opr_auto DESC LIMIT ${HOME_STAT}`,
        )
        .bind(SEASON),
      d
        .prepare(
          `SELECT m.event_code, m.level, m.series, m.match_number, s.alliance, s.np, s.adjusted,
                  (SELECT group_concat(x.team || ':' || COALESCE(xa.key, ''), char(31))
                   FROM match_teams x
                   LEFT JOIN team_avatars xa ON xa.team = x.team
                   WHERE x.match_id = m.id AND x.alliance = s.alliance) AS teams,
                  EXISTS (SELECT 1 FROM videos v WHERE v.match_id = m.id AND v.status = 'approved') AS has_video
           FROM match_scores s JOIN matches m ON m.id = s.match_id
           JOIN events e ON e.season = m.season AND e.code = m.event_code
           WHERE s.season = ? ${counted} ORDER BY s.np DESC LIMIT ${HOME_STAT}`,
        )
        .bind(SEASON),
      d
        .prepare(
          `SELECT a.team, a.event_code, e.name AS event_name, t.name_short, t.city, t.state_prov, t.country, t.home_region, av.key AS av FROM awards a
           JOIN events e ON e.season = a.season AND e.code = a.event_code
           LEFT JOIN teams t ON t.number = a.team LEFT JOIN team_avatars av ON av.team = a.team
           WHERE a.season = ? AND a.name LIKE 'Inspire%' AND a.series <= 1 AND a.team > 0 ${counted}
           ORDER BY e.date_end DESC LIMIT ${HOME_STAT}`,
        )
        .bind(SEASON),
    ]);
    const counts = countsR?.results[0] as { events: number; teams: number; matches: number };
    const events = ((evR?.results ?? []) as WeekEvent[]).sort((a, b) => compareWeek(a, b, today));
    const preview = events.slice(0, HOME_WEEK);
    const top = (topR?.results ?? []) as {
      team: number;
      name_short: string | null;
      city: string | null;
      state_prov: string | null;
      country: string | null;
      home_region: string | null;
      av: string | null;
      best_opr_np: number;
      best_event: string;
      wins: number;
      losses: number;
      ties: number;
    }[];
    const auto = (autoR?.results ?? []) as {
      team: number;
      name_short: string | null;
      city: string | null;
      state_prov: string | null;
      country: string | null;
      home_region: string | null;
      av: string | null;
      best_opr_auto: number;
      best_opr_c1: number | null;
    }[];
    const high = (highR?.results ?? []) as {
      event_code: string;
      level: string;
      series: number;
      match_number: number;
      alliance: string;
      np: number;
      adjusted: number;
      teams: string | null;
      has_video: number;
    }[];
    const inspire = (inspireR?.results ?? []) as {
      team: number;
      event_code: string;
      event_name: string;
      name_short: string | null;
      city: string | null;
      state_prov: string | null;
      country: string | null;
      home_region: string | null;
      av: string | null;
    }[];
    const fmt = (x: number) => x.toLocaleString("en-US");
    const live = events.filter((e) => eventStatus(e.date_start, e.date_end, today) === "live");
    const c1 = desc.components[0];

    return c.html(
      <Layout
        title="FTC Stats, Scores & Scouting"
        description="Fast, dense FIRST Tech Challenge stats: OPR, match results, rankings and team history from 2019 to today."
      >
        <h1>
          FIRST Tech Challenge · {desc.game} {seasonLabel(SEASON)}
        </h1>
        <p class="sitestats">
          {fmt(counts.events)} events · {fmt(counts.teams)} teams · {fmt(counts.matches)} matches scored ·{" "}
          {live.length} live now · <a href="/seasons">all seasons since 2019</a>
        </p>
        <div class="grid">
          <Box title="This Week" more={{ href: `/events/${SEASON}`, label: "All events" }}>
            {events.length === 0 ? (
              <p class="note">No events this week.</p>
            ) : (
              <Table>
                <tbody>
                  {preview.map((e, i) => weekRow(e, today, i >= HOME_WEEK_MOBILE ? "mhide" : undefined))}
                </tbody>
              </Table>
            )}
          </Box>

          <Box title="NP OPR Leaders" more={{ href: `/seasons/${SEASON}/leaders`, label: "Leaderboard" }}>
            {top.length === 0 ? (
              <p class="note">No results yet.</p>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th class="l">Team</th>
                    <Th k="NP OPR" />
                    <Th k="W-L-T" />
                  </tr>
                </thead>
                <tbody>
                  {top.map((t, i) => (
                    <tr class={i >= HOME_STAT_MOBILE ? "mhide" : undefined}>
                      <td>{i + 1}</td>
                      <td class="l">
                        <TeamName team={t.team} name={`${t.team} ${t.name_short ?? ""}`} av={t.av} loc={t} />
                      </td>
                      <td class="w">
                        {f1(t.best_opr_np)}
                        {correctedStat(SEASON, t.best_event, "np") && <Adj />}
                      </td>
                      <td data-v={t.wins}>{wlt(t.wins, t.losses, t.ties)}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
            {top.some((t) => correctedStat(SEASON, t.best_event, "np")) && <AdjNote />}
          </Box>

          <Box title="Highest Scores" more={{ href: `/seasons/${SEASON}/leaders?sort=maxnp`, label: "More" }}>
            {high.length === 0 ? (
              <p class="note">No results yet.</p>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <th class="vc" title="Video" />
                    <th title="No-penalty alliance score">NP</th>
                    <th class="l">Alliance</th>
                    <th class="l">Match</th>
                  </tr>
                </thead>
                <tbody>
                  {high.map((h, i) => {
                    const href = `/events/${SEASON}/${h.event_code}/${matchSlug(h.level, h.series, h.match_number)}`;
                    const teams = (h.teams ?? "")
                      .split("\u001f")
                      .filter(Boolean)
                      .map((x) => {
                        const [team, av] = x.split(":");
                        return { team: Number(team), av: av || null };
                      });
                    return (
                      <tr class={i >= HOME_STAT_MOBILE ? "mhide" : undefined}>
                        <VidCell href={href} has={h.has_video} />
                        <td class="w">
                          {h.np}
                          {h.adjusted ? <Adj /> : null}
                        </td>
                        <td class={`l ${h.alliance === "R" ? "r" : "b"}`}>
                          <TeamLinks teams={teams} season={SEASON} />
                        </td>
                        <td class="l">
                          <a href={href}>
                            {h.event_code} {matchLabel(h.level, h.series, h.match_number)}
                          </a>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            )}
            {high.some((h) => h.adjusted) && <AdjNote />}
          </Box>

          <Box title="Auto Leaders" more={{ href: `/seasons/${SEASON}/leaders?sort=auto`, label: "More" }}>
            {auto.length === 0 ? (
              <p class="note">No results yet.</p>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th class="l">Team</th>
                    <Th k="Auto" />
                    <th title={c1.tip}>{c1.label}</th>
                  </tr>
                </thead>
                <tbody>
                  {auto.map((t, i) => (
                    <tr class={i >= HOME_STAT_MOBILE ? "mhide" : undefined}>
                      <td>{i + 1}</td>
                      <td class="l">
                        <TeamName team={t.team} name={`${t.team} ${t.name_short ?? ""}`} av={t.av} loc={t} />
                      </td>
                      <td class="w">{f1(t.best_opr_auto)}</td>
                      <td>{(c1.count ? f2 : f1)(t.best_opr_c1)}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Box>

          <Box title="Recent Inspire Award Winners">
            {inspire.length === 0 ? (
              <p class="note">None posted yet.</p>
            ) : (
              <Table>
                <tbody>
                  {inspire.map((a, i) => (
                    <tr class={i >= HOME_STAT_MOBILE ? "mhide" : undefined}>
                      <td class="l">
                        <TeamName team={a.team} name={`${a.team} ${a.name_short ?? ""}`} av={a.av} loc={a} />
                      </td>
                      <td class="l">
                        <a class="clip" href={`/events/${SEASON}/${a.event_code}`}>
                          {a.event_name}
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Box>

          <Box title="Past Seasons" more={{ href: "/seasons", label: "All seasons" }}>
            <Table>
              <tbody>
                {ALL_SEASONS.filter((s) => s !== SEASON).map((s) => (
                  <tr>
                    <td class="l">{seasonLabel(s)}</td>
                    <td class="l">
                      <a href={`/events/${s}`}>{SEASONS[s]?.game}</a>
                    </td>
                    <td class="l">
                      <a href={`/seasons/${s}/leaders`}>Leaders</a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Box>
        </div>
      </Layout>,
    );
  }),
);

homeRoutes.get("/seasons", (c) =>
  cached(c, { ttl: 600 }, async () => {
    const mode = statsMode(c);
    const table = seasonStatsTable(mode);
    const highNp =
      mode === "official"
        ? `(SELECT MAX(sc.np) FROM match_scores sc
            JOIN matches hm ON hm.id = sc.match_id AND hm.season = y.year
            JOIN events he ON he.season = hm.season AND he.code = hm.event_code
            WHERE ${seasonKindIn("he")})`
        : `(SELECT MAX(np) FROM match_scores s WHERE s.season = y.year)`;
    const { results } = await db(c)
      .prepare(
        `SELECT y.year, y.backfilled_at, y.backfill_stage,
                (SELECT COUNT(*) FROM events e WHERE e.season = y.year) AS events,
                (SELECT COUNT(*) FROM matches m WHERE m.season = y.year AND m.played = 1) AS matches,
                (SELECT COUNT(*) FROM ${table} s WHERE s.season = y.year) AS teams,
                ${highNp} AS high_np,
                (SELECT team FROM ${table} s WHERE s.season = y.year ORDER BY best_opr_np DESC LIMIT 1) AS top_team,
                (SELECT MAX(best_opr_np) FROM ${table} s WHERE s.season = y.year) AS top_opr
         FROM seasons y ORDER BY y.year DESC`,
      )
      .all<{
        year: number;
        backfilled_at: string | null;
        backfill_stage: string | null;
        events: number;
        matches: number;
        teams: number;
        high_np: number | null;
        top_team: number | null;
        top_opr: number | null;
      }>();
    return c.html(
      <Layout
        title="Seasons"
        description="Every FIRST Tech Challenge season since 2019: events, leaders and records."
      >
        <h1>Seasons</h1>
        <p class="sitestats">
          FIRST Tech Challenge since SKYSTONE (2019). Older seasons are still being loaded where noted.
        </p>
        <Table>
          <thead>
            <tr>
              <th class="l">Season</th>
              <th class="l">Game</th>
              <th class="l">Program</th>
              <th>Events</th>
              <th>Matches</th>
              <th title="Teams with match results">Teams</th>
              <th title="Highest alliance no-penalty score">High NP</th>
              <th class="l" title="Best single-event NP OPR">
                Top team
              </th>
              <th class="l"> </th>
            </tr>
          </thead>
          <tbody class="seasons">
            {results.map((r) => {
              const d = SEASONS[r.year];
              return (
                <tr>
                  <td class="l" data-v={r.year}>
                    {seasonLabel(r.year)}
                  </td>
                  <td class="l g">
                    <a href={`/events/${r.year}`}>{d?.game}</a>
                  </td>
                  <td class="l">
                    <i>{d?.program}</i>
                  </td>
                  <td>{r.events.toLocaleString("en-US")}</td>
                  <td>{r.matches.toLocaleString("en-US")}</td>
                  <td>{r.teams.toLocaleString("en-US")}</td>
                  <td>{r.high_np ?? ""}</td>
                  <td class="l">
                    {r.top_team && (
                      <>
                        <a href={`/teams/${r.top_team}?season=${r.year}`}>{r.top_team}</a>{" "}
                        <span class="note">{f1(r.top_opr)}</span>
                      </>
                    )}
                  </td>
                  <td class="l">
                    <a href={`/seasons/${r.year}/leaders`}>Leaders</a>
                    {!r.backfilled_at && <span class="pill">loading</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Layout>,
    );
  }),
);

homeRoutes.get("/seasons/:season{[0-9]{4}}/leaders", (c) => {
  const season = Number(c.req.param("season"));
  if (!isSeason(season)) return c.notFound();
  return cached(c, { ttl: 300 }, async () => {
    const mode = statsMode(c);
    const table = seasonStatsTable(mode);
    const desc = getSeason(season);
    // Sort keys: fixed ones plus the season's four components.
    const sorts: Record<string, [string, string]> = {
      np: ["best_opr_np", "Best NP OPR"],
      latest: ["latest_opr_np", "Latest NP OPR"],
      auto: ["best_opr_auto", "Auto OPR"],
      teleop: ["best_opr_teleop", "TeleOp OPR"],
      endgame: ["best_opr_endgame", "Endgame OPR"],
      ...Object.fromEntries(
        desc.components.map((comp) => [comp.key, [`best_opr_${comp.key}`, `${comp.label} OPR`]]),
      ),
      maxnp: ["best_np", "Best match NP"],
    };
    const sortKey = c.req.query("sort") ?? "np";
    const [col, colLabel] = sorts[sortKey] ?? (sorts.np as [string, string]);
    const { size, page: requested } = listWindow(c);
    const d = db(c);
    const [countR, listR] = await d.batch([
      d
        .prepare(`SELECT COUNT(*) AS n FROM ${table} s WHERE s.season = ? AND s.${col} IS NOT NULL`)
        .bind(season),
      d
        .prepare(
          `SELECT s.*, t.name_short, t.city, t.state_prov, t.country, t.home_region, av.key AS av,
                  (SELECT MAX(ms.adjusted) FROM match_scores ms WHERE ms.match_id = s.best_np_match_id) AS np_adj
           FROM ${table} s
           LEFT JOIN teams t ON t.number = s.team
           LEFT JOIN team_avatars av ON av.team = s.team
           WHERE s.season = ? AND s.${col} IS NOT NULL ORDER BY s.${col} DESC LIMIT ? OFFSET ?`,
        )
        .bind(season, size, (requested - 1) * size),
    ]);
    const total = Number((countR?.results[0] as { n: number } | undefined)?.n ?? 0);
    const pages = Math.max(1, Math.ceil(total / size));
    const page = Math.min(requested, pages);
    let results = (listR?.results ?? []) as (Record<string, number | string | null> & {
      team: number;
      av: string | null;
    })[];
    if (results.length === 0 && total > 0 && page !== requested) {
      const again = await d
        .prepare(
          `SELECT s.*, t.name_short, t.city, t.state_prov, t.country, t.home_region, av.key AS av,
                  (SELECT MAX(ms.adjusted) FROM match_scores ms WHERE ms.match_id = s.best_np_match_id) AS np_adj
           FROM ${table} s
           LEFT JOIN teams t ON t.number = s.team
           LEFT JOIN team_avatars av ON av.team = s.team
           WHERE s.season = ? AND s.${col} IS NOT NULL ORDER BY s.${col} DESC LIMIT ? OFFSET ?`,
        )
        .bind(season, size, (page - 1) * size)
        .all<Record<string, number | string | null> & { team: number; av: string | null }>();
      results = again.results ?? [];
    }
    const href = (p: number) => {
      const q = new URLSearchParams();
      if (sortKey !== "np") q.set("sort", sortKey);
      if (p > 1) q.set("page", String(p));
      const s = q.toString();
      return `/seasons/${season}/leaders${s ? `?${s}` : ""}`;
    };
    const n = (v: unknown) => v as number | null;
    type LeaderRow = (typeof results)[number];
    /** `adj`: the value comes from corrected scores, so it gets an asterisk. */
    const best = (col: string) => (r: LeaderRow) => correctedStat(season, r.best_event as string | null, col);
    const cols: {
      k: string;
      head: unknown;
      fmt: (x: number | null) => string | number;
      adj: (r: LeaderRow) => boolean;
    }[] = [
      { k: "best_opr_np", head: <Th k="Best NP" />, fmt: f1, adj: best("np") },
      {
        k: "latest_opr_np",
        head: <Th k="Latest NP" />,
        fmt: f1,
        adj: (r) => correctedStat(season, r.latest_event as string | null, "np"),
      },
      { k: "best_opr_auto", head: <Th k="Auto" />, fmt: f1, adj: best("auto") },
      { k: "best_opr_teleop", head: <Th k="TeleOp" />, fmt: f1, adj: best("teleop") },
      { k: "best_opr_endgame", head: <Th k="Endgame" />, fmt: f1, adj: best("endgame") },
      ...desc.components.map((comp) => ({
        k: `best_opr_${comp.key}`,
        head: <th title={comp.tip}>{comp.label}</th>,
        fmt: comp.count ? f2 : f1,
        adj: best(comp.key),
      })),
      { k: "best_np", head: <Th k="Max NP" />, fmt: (x) => x ?? "", adj: (r) => !!r.np_adj },
    ];
    const anyAdj = results.some((r) => cols.some((cl) => cl.adj(r)));
    const H = Object.fromEntries(cols.map((cl) => [cl.k, heatScale(results.map((r) => n(r[cl.k])))]));
    return c.html(
      <Layout title={`${seasonLabel(season)} ${desc.game} Leaders: ${colLabel}`}>
        <h1>
          {seasonLabel(season)} Leaders · {desc.game}
        </h1>
        <form class="filters" method="get">
          {/* biome-ignore lint/a11y/noLabelWithoutControl: SeasonSelect renders the select */}
          <label>
            Season
            <SeasonSelect current={season} href={(s) => `/seasons/${s}/leaders`} />
          </label>
          <label>
            Rank by
            <select name="sort" {...({ onchange: "this.form.submit()" } as Record<string, string>)}>
              {Object.entries(sorts).map(([k, [, label]]) => (
                <option value={k} selected={k === sortKey}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" class="go">
            Go
          </button>
        </form>
        <p class="note">
          {`Best = best single-event OPR${mode === "official" ? ". Off-season events are excluded" : ", including off-season"}. Click headers to re-sort this page.`}
        </p>
        {results.length === 0 ? (
          <p class="note">
            No stats for this season yet{season !== SEASON ? " — it may still be loading." : "."}
          </p>
        ) : (
          <>
            <Pager
              page={page}
              pages={pages}
              total={total}
              start={(page - 1) * size}
              size={size}
              href={href}
            />
            <Table>
              <thead>
                <tr>
                  <th>#</th>
                  <th class="l">Team</th>
                  <Th k="Ev" />
                  <Th k="W-L-T" />
                  {cols.map((cl) => cl.head)}
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr>
                    <td>{(page - 1) * size + i + 1}</td>
                    <td class="l" data-v={r.team}>
                      <TeamName
                        team={r.team}
                        name={r.name_short as string | null}
                        av={r.av}
                        num
                        season={season}
                        loc={r as never}
                        sub={[r.state_prov, r.country].filter(Boolean).join(", ")}
                      />
                    </td>
                    <td>{r.events_played}</td>
                    <td data-v={r.wins}>{wlt(n(r.wins) ?? 0, n(r.losses) ?? 0, n(r.ties) ?? 0)}</td>
                    {cols.map((cl) => (
                      <td class={`ht${cl.k === col ? " w" : ""}`} style={H[cl.k]?.(n(r[cl.k]))}>
                        {cl.fmt(n(r[cl.k]))}
                        {cl.adj(r) && <Adj />}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </Table>
            {anyAdj && <AdjNote />}
            <Pager
              page={page}
              pages={pages}
              total={total}
              start={(page - 1) * size}
              size={size}
              href={href}
            />
          </>
        )}
      </Layout>,
    );
  });
});

homeRoutes.get("/search", async (c) => {
  const q = (c.req.query("q") ?? "").trim();
  if (/^\d{1,6}$/.test(q)) return c.redirect(`/teams/${q}`, 302);
  if (/^[A-Za-z0-9]{3,12}$/.test(q)) {
    const ev = await db(c)
      .prepare("SELECT season, code FROM events WHERE code = ? ORDER BY season DESC LIMIT 1")
      .bind(q.toUpperCase())
      .first<{ season: number; code: string }>();
    if (ev) return c.redirect(`/events/${ev.season}/${ev.code}`, 302);
  }
  const like = `%${q.replace(/[%_]/g, "")}%`;
  const d = db(c);
  const [tR, eR] =
    q.length < 2
      ? [undefined, undefined]
      : await d.batch([
          d
            .prepare(
              `SELECT t.number, t.name_short, t.city, t.state_prov, t.country, t.home_region, av.key AS av FROM teams t
               LEFT JOIN team_avatars av ON av.team = t.number
               WHERE t.name_short LIKE ?1 OR t.city LIKE ?1 ORDER BY t.number LIMIT 100`,
            )
            .bind(like),
          d
            .prepare(
              `SELECT season, code, name, date_start, date_end, city, state_prov FROM events
               WHERE name LIKE ?1 OR city LIKE ?1 ORDER BY date_start DESC LIMIT 60`,
            )
            .bind(like),
        ]);
  const teams = (tR?.results ?? []) as {
    number: number;
    name_short: string;
    city: string | null;
    state_prov: string | null;
    country: string | null;
    home_region: string | null;
    av: string | null;
  }[];
  const events = (eR?.results ?? []) as {
    season: number;
    code: string;
    name: string;
    date_start: string;
    date_end: string;
    city: string | null;
    state_prov: string | null;
  }[];
  return c.html(
    <Layout title={`Search: ${q}`}>
      <h1>Search: “{q}”</h1>
      {q.length < 2 && <p class="note">Type at least two characters, a team number, or an event code.</p>}
      <div class="grid">
        <Box title={`Teams (${teams.length})`}>
          <Table>
            <tbody>
              {teams.map((t) => (
                <tr>
                  <td class="l wrap">
                    <TeamName
                      team={t.number}
                      name={t.name_short}
                      av={t.av}
                      num
                      loc={t}
                      sub={[t.city, t.state_prov, t.country].filter(Boolean).join(", ")}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Box>
        <Box title={`Events (${events.length})`}>
          <Table>
            <tbody>
              {events.map((e) => (
                <tr>
                  <td class="l note">{e.season}</td>
                  <td class="l wrap">
                    <a href={`/events/${e.season}/${e.code}`}>{e.name}</a>
                    <div class="sub">
                      {fmtDateRange(e.date_start, e.date_end)} ·{" "}
                      {[e.city, e.state_prov].filter(Boolean).join(", ")}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Box>
      </div>
    </Layout>,
  );
});

/** Two-line event rows. Stat lists are one line, so they show more to land at a similar height. */
const HOME_WEEK = 11;
const HOME_WEEK_MOBILE = 7;
const HOME_STAT = 15;
const HOME_STAT_MOBILE = 9;

type WeekEvent = {
  code: string;
  name: string;
  city: string | null;
  state_prov: string | null;
  country: string | null;
  date_start: string;
  date_end: string;
  played: number;
  teams: number;
  videos: number;
  streams: number;
  live_stream_url: string | null;
  webcast: number;
};

/**
 * Live events first. Within live and within the rest, scored events come before
 * ones that only have a team list, and those come before empty listings.
 * Upcoming events with data stay ahead of events that already ended.
 */
function compareWeek(a: WeekEvent, b: WeekEvent, today: string): number {
  const rank = (e: WeekEvent) => {
    const status = eventStatus(e.date_start, e.date_end, today);
    const live = status === "live" ? 0 : 1;
    const data = e.played > 0 ? 0 : e.teams > 0 ? 1 : 2;
    const ended = status === "final" ? 1 : 0;
    return live * 6 + data * 2 + (live === 0 ? 0 : ended);
  };
  const d = rank(a) - rank(b);
  if (d) return d;
  if (rank(a) < 6 && a.played !== b.played) return b.played - a.played;
  if (a.date_start !== b.date_start) return a.date_start < b.date_start ? -1 : 1;
  return a.name.localeCompare(b.name);
}

/** Livestream link, an uploaded stream, or match video. Hover text says which. */
function mediaMark(e: WeekEvent): { href: string; title: string; external: boolean } | null {
  const bits: string[] = [];
  if (e.live_stream_url || e.webcast) bits.push("Livestream");
  if (e.streams > 0)
    bits.push(e.streams === 1 ? "1 livestream recording" : `${e.streams} livestream recordings`);
  if (e.videos > 0) bits.push(e.videos === 1 ? "1 match video" : `${e.videos} match videos`);
  if (!bits.length) return null;
  return {
    href: e.live_stream_url || `/events/${SEASON}/${e.code}#matches`,
    title: bits.join(" · "),
    external: !!e.live_stream_url,
  };
}

function weekRow(e: WeekEvent, today: string, cls?: string) {
  const s = eventStatus(e.date_start, e.date_end, today);
  const place = [e.city, e.state_prov, e.country].filter(Boolean).join(", ");
  const extra = e.played > 0 ? "" : e.teams > 0 ? `${e.teams} teams` : "";
  const sub = [place, extra].filter(Boolean).join(" · ");
  const media = mediaMark(e);
  const eventHref = `/events/${SEASON}/${e.code}`;
  return (
    <tr class={cls}>
      <td class="l when" data-v={e.date_start}>
        {s === "live" ? <StatusPill s={s} /> : <span class="note">{shortDate(e.date_start)}</span>}
      </td>
      <td class="l wk">
        <a href={eventHref}>{e.name}</a>
        {e.played > 0 && (
          <a
            class="mark res"
            href={eventHref}
            title={`${e.played} match${e.played === 1 ? "" : "es"} with results`}
          >
            ●
          </a>
        )}
        {media && (
          <a
            class="mark vid"
            href={media.href}
            title={media.title}
            {...(media.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          >
            ▶
          </a>
        )}
        {sub && <div class="sub">{sub}</div>}
      </td>
    </tr>
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-10-17…" → "Sat Oct 17" (dates are event-local, so no timezone math). */
function shortDate(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number) as [number, number, number];
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${dow} ${MONTHS[m - 1]} ${d}`;
}
