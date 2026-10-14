import { Hono } from "hono";
import { cached } from "../cache";
import { db, type Env, matchLabel, matchSlug, SEASON } from "../env";
import { f1, f2, fmtDateRange, Layout, Table, wlt } from "../views/layout";
import { Box, eventStatus, heatScale, StatusPill, TeamName, Th } from "../views/ui";

export const homeRoutes = new Hono<{ Bindings: Env }>();
const seasonLabel = `${SEASON}–${String(SEASON + 1).slice(2)}`;

homeRoutes.get("/", (c) =>
  cached(c, { ttl: 60 }, async () => {
    const d = db(c);
    const today = new Date().toISOString().slice(0, 10);
    const [countsR, evR, topR, autoR, highR, inspireR] = await d.batch([
      d
        .prepare(
          `SELECT (SELECT COUNT(*) FROM events WHERE season = ?1) AS events,
                  (SELECT COUNT(*) FROM team_seasons WHERE season = ?1) AS teams,
                  (SELECT COUNT(*) FROM matches WHERE season = ?1 AND played = 1) AS matches,
                  (SELECT COUNT(*) FROM team_avatars) AS avatars`,
        )
        .bind(SEASON),
      d
        .prepare(
          `SELECT e.code, e.name, e.city, e.state_prov, e.country, e.date_start, e.date_end,
                  (SELECT COUNT(*) FROM matches m WHERE m.season = e.season AND m.event_code = e.code AND m.played = 1) AS played
           FROM events e
           WHERE e.season = ? AND substr(e.date_end, 1, 10) >= date(?, '-3 days') AND substr(e.date_start, 1, 10) <= date(?, '+7 days')
           ORDER BY e.date_start, e.name LIMIT 40`,
        )
        .bind(SEASON, today, today),
      d.prepare(
        `SELECT s.team, t.name_short, av.key AS av, s.best_opr_np, s.best_event, s.wins, s.losses, s.ties
         FROM s2026_team_season_stats s LEFT JOIN teams t ON t.number = s.team LEFT JOIN team_avatars av ON av.team = s.team
         WHERE s.best_opr_np IS NOT NULL ORDER BY s.best_opr_np DESC LIMIT 15`,
      ),
      d.prepare(
        `SELECT s.team, t.name_short, av.key AS av, s.best_opr_auto, s.best_opr_tips
         FROM s2026_team_season_stats s LEFT JOIN teams t ON t.number = s.team LEFT JOIN team_avatars av ON av.team = s.team
         WHERE s.best_opr_auto IS NOT NULL ORDER BY s.best_opr_auto DESC LIMIT 10`,
      ),
      d
        .prepare(
          `SELECT m.event_code, m.level, m.series, m.match_number, s.alliance, s.pre_foul_total AS np,
                  (SELECT group_concat(team, ' ') FROM match_teams x WHERE x.match_id = m.id AND x.alliance = s.alliance) AS teams
           FROM s2026_match_scores s JOIN matches m ON m.id = s.match_id
           WHERE m.season = ? ORDER BY s.pre_foul_total DESC LIMIT 10`,
        )
        .bind(SEASON),
      d
        .prepare(
          `SELECT a.team, a.event_code, e.name AS event_name, t.name_short, av.key AS av FROM awards a
           JOIN events e ON e.season = a.season AND e.code = a.event_code
           LEFT JOIN teams t ON t.number = a.team LEFT JOIN team_avatars av ON av.team = a.team
           WHERE a.season = ? AND a.name LIKE 'Inspire%' AND a.series <= 1 AND a.team > 0
           ORDER BY e.date_end DESC LIMIT 10`,
        )
        .bind(SEASON),
    ]);
    const counts = countsR?.results[0] as { events: number; teams: number; matches: number; avatars: number };
    type Ev = {
      code: string;
      name: string;
      city: string | null;
      state_prov: string | null;
      country: string | null;
      date_start: string;
      date_end: string;
      played: number;
    };
    const events = evR?.results as Ev[];
    const top = topR?.results as {
      team: number;
      name_short: string | null;
      av: string | null;
      best_opr_np: number;
      best_event: string;
      wins: number;
      losses: number;
      ties: number;
    }[];
    const auto = autoR?.results as {
      team: number;
      name_short: string | null;
      av: string | null;
      best_opr_auto: number;
      best_opr_tips: number;
    }[];
    const high = highR?.results as {
      event_code: string;
      level: string;
      series: number;
      match_number: number;
      alliance: string;
      np: number;
      teams: string | null;
    }[];
    const inspire = inspireR?.results as {
      team: number;
      event_code: string;
      event_name: string;
      name_short: string | null;
      av: string | null;
    }[];
    const fmt = (x: number) => x.toLocaleString("en-US");
    const live = events.filter((e) => eventStatus(e.date_start, e.date_end, today) === "live");

    return c.html(
      <Layout
        title="FTC Stats, Scores & Scouting"
        description="Fast, dense FIRST Tech Challenge stats: OPR, match results, rankings, team avatars and scouting for BIOBUZZ."
      >
        <h1>FIRST Tech Challenge · BIOBUZZ {seasonLabel}</h1>
        <p class="sitestats">
          {fmt(counts.events)} events · {fmt(counts.teams)} teams · {fmt(counts.matches)} matches scored ·{" "}
          {live.length} live now
        </p>
        <div class="grid">
          <Box title="This Week" more={{ href: `/events/${SEASON}`, label: "All events" }}>
            {events.length === 0 ? (
              <p class="note">No events this week.</p>
            ) : (
              <Table>
                <tbody>
                  {events.map((e) => {
                    const s = eventStatus(e.date_start, e.date_end, today);
                    return (
                      <tr>
                        <td class="l" data-v={e.date_start}>
                          {s === "live" ? (
                            <StatusPill s={s} />
                          ) : (
                            <span class="note">{shortDate(e.date_start)}</span>
                          )}
                        </td>
                        <td class="l">
                          <a href={`/events/${SEASON}/${e.code}`}>{e.name}</a>
                          <div class="note">
                            {[e.city, e.state_prov, e.country].filter(Boolean).join(", ")}
                          </div>
                        </td>
                        <td title="Matches played">{e.played || ""}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            )}
          </Box>

          <Box title="NP OPR Leaders" more={{ href: `/seasons/${SEASON}/leaders`, label: "Leaderboard" }}>
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
                  <tr>
                    <td>{i + 1}</td>
                    <td class="l">
                      <TeamName team={t.team} name={`${t.team} ${t.name_short ?? ""}`} av={t.av} />
                    </td>
                    <td class="w">{f1(t.best_opr_np)}</td>
                    <td data-v={t.wins}>{wlt(t.wins, t.losses, t.ties)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Box>

          <Box title="Highest Scores" more={{ href: `/seasons/${SEASON}/leaders?sort=maxnp`, label: "More" }}>
            <Table>
              <thead>
                <tr>
                  <th title="No-penalty alliance score">NP</th>
                  <th class="l">Alliance</th>
                  <th class="l">Match</th>
                </tr>
              </thead>
              <tbody>
                {high.map((h) => (
                  <tr>
                    <td class="w">{h.np}</td>
                    <td class={`l ${h.alliance === "R" ? "r" : "b"}`}>
                      {(h.teams ?? "").split(" ").map((t, i) => (
                        <>
                          {i > 0 && " "}
                          <a href={`/teams/${t}`}>{t}</a>
                        </>
                      ))}
                    </td>
                    <td class="l">
                      <a
                        href={`/events/${SEASON}/${h.event_code}/${matchSlug(h.level, h.series, h.match_number)}`}
                      >
                        {h.event_code} {matchLabel(h.level, h.series, h.match_number)}
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Box>

          <Box title="Auto Leaders" more={{ href: `/seasons/${SEASON}/leaders?sort=auto`, label: "More" }}>
            <Table>
              <thead>
                <tr>
                  <th>#</th>
                  <th class="l">Team</th>
                  <Th k="Auto" />
                  <Th k="Tips" />
                </tr>
              </thead>
              <tbody>
                {auto.map((t, i) => (
                  <tr>
                    <td>{i + 1}</td>
                    <td class="l">
                      <TeamName team={t.team} name={`${t.team} ${t.name_short ?? ""}`} av={t.av} />
                    </td>
                    <td class="w">{f1(t.best_opr_auto)}</td>
                    <td>{f2(t.best_opr_tips)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Box>

          <Box title="Recent Inspire Award Winners">
            {inspire.length === 0 ? (
              <p class="note">None posted yet.</p>
            ) : (
              <Table>
                <tbody>
                  {inspire.map((a) => (
                    <tr>
                      <td class="l">
                        <TeamName team={a.team} name={`${a.team} ${a.name_short ?? ""}`} av={a.av} />
                      </td>
                      <td class="l">
                        <a href={`/events/${SEASON}/${a.event_code}`}>{a.event_name}</a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Box>
        </div>
      </Layout>,
    );
  }),
);

const LEADER_SORTS: Record<string, [string, string]> = {
  np: ["best_opr_np", "Best NP OPR"],
  latest: ["latest_opr_np", "Latest NP OPR"],
  auto: ["best_opr_auto", "Auto OPR"],
  teleop: ["best_opr_teleop", "TeleOp OPR"],
  tips: ["best_opr_tips", "Tips OPR"],
  flower: ["best_opr_flower", "Flower OPR"],
  maxnp: ["best_np", "Best match NP"],
};

homeRoutes.get("/seasons/:season{[0-9]{4}}/leaders", (c) =>
  cached(c, { ttl: 300 }, async () => {
    const sortKey = c.req.query("sort") ?? "np";
    const [col, colLabel] = LEADER_SORTS[sortKey] ?? (LEADER_SORTS.np as [string, string]);
    const { results } = await db(c)
      .prepare(
        `SELECT s.*, t.name_short, t.state_prov, t.country, av.key AS av FROM s2026_team_season_stats s
         LEFT JOIN teams t ON t.number = s.team
         LEFT JOIN team_avatars av ON av.team = s.team
         WHERE s.${col} IS NOT NULL ORDER BY s.${col} DESC LIMIT 1000`,
      )
      .all<Record<string, number | string | null> & { team: number; av: string | null }>();
    const n = (v: unknown) => v as number | null;
    const H = Object.fromEntries(
      [
        "best_opr_np",
        "latest_opr_np",
        "best_opr_auto",
        "best_opr_teleop",
        "best_opr_tips",
        "best_opr_flower",
        "best_np",
      ].map((k) => [k, heatScale(results.map((r) => n(r[k])))]),
    ) as Record<string, (v: number | null) => string | undefined>;
    const cell = (r: Record<string, unknown>, k: string, fmt: (x: number | null) => string | number) => (
      <td class={`ht${k === col ? " w" : ""}`} style={H[k]?.(n(r[k]))}>
        {fmt(n(r[k]))}
      </td>
    );
    return c.html(
      <Layout title={`${SEASON} Leaders: ${colLabel}`}>
        <h1>
          {seasonLabel} Leaders · {colLabel}
        </h1>
        <p class="note">
          Rank by:{" "}
          {Object.entries(LEADER_SORTS).map(([k, [, label]]) => (
            <>{k === sortKey ? <b>{label}</b> : <a href={`?sort=${k}`}>{label}</a>} · </>
          ))}
          Best = best single-event OPR. Top 1,000 shown; click headers to re-sort.
        </p>
        <Table>
          <thead>
            <tr>
              <th>#</th>
              <th>Team</th>
              <th class="l">Name</th>
              <th class="l">Loc</th>
              <Th k="Ev" />
              <Th k="W-L-T" />
              <Th k="Best NP" />
              <Th k="Latest NP" />
              <Th k="Auto" />
              <Th k="TeleOp" />
              <Th k="Tips" />
              <Th k="Flower" />
              <Th k="Max NP" />
            </tr>
          </thead>
          <tbody>
            {results.map((r, i) => (
              <tr>
                <td>{i + 1}</td>
                <td>
                  <a href={`/teams/${r.team}`}>{r.team}</a>
                </td>
                <td class="l">
                  <TeamName team={r.team} name={r.name_short as string | null} av={r.av} />
                </td>
                <td class="l">{[r.state_prov, r.country].filter(Boolean).join(", ")}</td>
                <td>{r.events_played}</td>
                <td data-v={r.wins}>{wlt(n(r.wins) ?? 0, n(r.losses) ?? 0, n(r.ties) ?? 0)}</td>
                {cell(r, "best_opr_np", f1)}
                {cell(r, "latest_opr_np", f1)}
                {cell(r, "best_opr_auto", f1)}
                {cell(r, "best_opr_teleop", f1)}
                {cell(r, "best_opr_tips", f2)}
                {cell(r, "best_opr_flower", f1)}
                {cell(r, "best_np", (x) => x ?? "")}
              </tr>
            ))}
          </tbody>
        </Table>
      </Layout>,
    );
  }),
);

homeRoutes.get("/search", async (c) => {
  const q = (c.req.query("q") ?? "").trim();
  if (/^\d{1,6}$/.test(q)) return c.redirect(`/teams/${q}`, 302);
  if (/^[A-Za-z0-9]{3,12}$/.test(q)) {
    const ev = await db(c)
      .prepare("SELECT code FROM events WHERE season = ? AND code = ?")
      .bind(SEASON, q.toUpperCase())
      .first();
    if (ev) return c.redirect(`/events/${SEASON}/${q.toUpperCase()}`, 302);
  }
  const like = `%${q.replace(/[%_]/g, "")}%`;
  const d = db(c);
  const [tR, eR] =
    q.length < 2
      ? [undefined, undefined]
      : await d.batch([
          d
            .prepare(
              `SELECT t.number, t.name_short, t.city, t.state_prov, t.country, av.key AS av FROM teams t
               LEFT JOIN team_avatars av ON av.team = t.number
               WHERE t.name_short LIKE ?1 OR t.city LIKE ?1 ORDER BY t.number LIMIT 100`,
            )
            .bind(like),
          d
            .prepare(
              `SELECT code, name, date_start, date_end, city, state_prov FROM events
               WHERE season = ? AND (name LIKE ?2 OR city LIKE ?2) ORDER BY date_start LIMIT 50`,
            )
            .bind(SEASON, like),
        ]);
  const teams = (tR?.results ?? []) as {
    number: number;
    name_short: string;
    city: string | null;
    state_prov: string | null;
    country: string | null;
    av: string | null;
  }[];
  const events = (eR?.results ?? []) as {
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
                  <td>
                    <a href={`/teams/${t.number}`}>{t.number}</a>
                  </td>
                  <td class="l">
                    <TeamName team={t.number} name={t.name_short} av={t.av} />
                  </td>
                  <td class="l note">{[t.city, t.state_prov, t.country].filter(Boolean).join(", ")}</td>
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
                  <td class="l">
                    <a href={`/events/${SEASON}/${e.code}`}>{e.name}</a>
                  </td>
                  <td class="l note">
                    {fmtDateRange(e.date_start, e.date_end)} ·{" "}
                    {[e.city, e.state_prov].filter(Boolean).join(", ")}
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

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-10-17…" → "Sat Oct 17" (dates are event-local, so no timezone math). */
function shortDate(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number) as [number, number, number];
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${dow} ${MONTHS[m - 1]} ${d}`;
}
