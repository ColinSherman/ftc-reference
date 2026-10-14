import { Hono } from "hono";
import { cached } from "../cache";
import { db, type Env, matchLabel, matchSlug, SEASON } from "../env";
import { f1, f2, fmtDateRange, Layout, Table, wlt } from "../views/layout";

export const teamRoutes = new Hono<{ Bindings: Env }>();

interface LogRow {
  event_code: string;
  level: string;
  series: number;
  match_number: number;
  alliance: string;
  red_score: number | null;
  blue_score: number | null;
  red_np: number | null;
  blue_np: number | null;
  winner: string | null;
  played: number;
  teams: string;
}

// Team pages span many events, so they use a short TTL rather than per-event versions.
teamRoutes.get("/:n{[0-9]+}", (c) =>
  cached(c, { ttl: 120 }, async () => {
    const n = Number(c.req.param("n"));
    const d = db(c);
    const [teamR, tsR, evR, logR, awR] = await d.batch([
      d.prepare("SELECT * FROM teams WHERE number = ?").bind(n),
      d.prepare("SELECT * FROM team_seasons WHERE season = ? AND number = ?").bind(SEASON, n),
      d
        .prepare(
          `SELECT e.code, e.name, e.date_start, e.date_end, e.type_name, s.*, r.rank AS official_rank
           FROM event_teams et
           JOIN events e ON e.season = et.season AND e.code = et.event_code
           LEFT JOIN s2026_team_event_stats s ON s.event_code = et.event_code AND s.team = et.team
           LEFT JOIN rankings r ON r.season = et.season AND r.event_code = et.event_code AND r.team = et.team
           WHERE et.season = ? AND et.team = ? ORDER BY e.date_start`,
        )
        .bind(SEASON, n),
      d
        .prepare(
          `SELECT m.event_code, m.level, m.series, m.match_number, mt.alliance, m.red_score, m.blue_score,
                  m.red_np, m.blue_np, m.winner, m.played,
                  (SELECT group_concat(x.station || ':' || x.team) FROM match_teams x WHERE x.match_id = m.id) AS teams
           FROM match_teams mt JOIN matches m ON m.id = mt.match_id
           WHERE mt.team = ? AND m.season = ?
           ORDER BY m.scheduled_at, CASE m.level WHEN 'Q' THEN 0 ELSE 1 END, m.series, m.match_number`,
        )
        .bind(n, SEASON),
      d
        .prepare(
          `SELECT a.name, a.event_code, e.name AS event_name FROM awards a
           JOIN events e ON e.season = a.season AND e.code = a.event_code
           WHERE a.team = ? AND a.season = ? ORDER BY e.date_start`,
        )
        .bind(n, SEASON),
    ]);
    const team = teamR?.results[0] as Record<string, string | number | null> | undefined;
    if (!team)
      return c.html(
        <Layout title="Team not found">
          <h1>Team {n} not found</h1>
        </Layout>,
        404,
      );
    const ts = tsR?.results[0] as Record<string, string | null> | undefined;
    type Ev = Record<string, number | null> & {
      code: string;
      name: string;
      date_start: string;
      date_end: string;
      type_name: string | null;
    };
    const events = evR?.results as unknown as Ev[];
    const log = logR?.results as LogRow[];
    const awards = awR?.results as { name: string; event_code: string; event_name: string }[];

    const played = events.filter((e) => e.played);
    const tot = (k: string) => played.reduce((s, e) => s + (e[k] ?? 0), 0);
    const bestNp = Math.max(...played.map((e) => e.opr_np ?? Number.NEGATIVE_INFINITY));
    const location = [team.city, team.state_prov, team.country].filter(Boolean).join(", ");

    return c.html(
      <Layout
        title={`Team ${n} ${team.name_short ?? ""}`}
        description={`FTC team ${n} ${team.name_short ?? ""} stats, OPR and match results.`}
      >
        <h1>
          {n} <span style="color:var(--muted)">·</span> {team.name_short}
        </h1>
        <div class="bio">
          {team.name_full && (
            <div>
              <b>Sponsors:</b> {String(team.name_full).slice(0, 140)}
            </div>
          )}
          {location && (
            <div>
              <b>Location:</b> {location}
            </div>
          )}
          {team.rookie_year && (
            <div>
              <b>Rookie year:</b> {team.rookie_year}
            </div>
          )}
          {ts?.robot_name && (
            <div>
              <b>Robot:</b> {ts.robot_name}
            </div>
          )}
          {ts?.league_code && (
            <div>
              <b>League:</b> {ts.region_code}-{ts.league_code}
            </div>
          )}
          {team.website && (
            <div>
              <a href={String(team.website)} rel="nofollow">
                Website
              </a>
            </div>
          )}
        </div>
        {played.length > 0 && (
          <div class="bio">
            <div>
              <b>{SEASON} record:</b> {wlt(tot("wins"), tot("losses"), tot("ties"))}
            </div>
            <div>
              <b>Best NP OPR:</b> {f1(bestNp)}
            </div>
            <div>
              <b>Events:</b> {events.length}
            </div>
          </div>
        )}
        <div class="tabs">
          <a href="#events">Events</a>
          <a href="#matches">Match Log</a>
          <a href="#awards">Awards</a>
        </div>

        <h2 id="events">{SEASON} Events</h2>
        <Table>
          <thead>
            <tr>
              <th class="l">Dates</th>
              <th class="l">Event</th>
              <th>Rk</th>
              <th>W-L-T</th>
              <th>NP OPR</th>
              <th>Auto</th>
              <th>TeleOp</th>
              <th>Tips</th>
              <th>Flower</th>
              <th>Garden</th>
              <th>CCWM</th>
              <th>Avg NP</th>
              <th>Max NP</th>
              <th>RP/M</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr>
                <td class="l" data-v={e.date_start}>
                  {fmtDateRange(e.date_start, e.date_end)}
                </td>
                <td class="l">
                  <a href={`/events/${SEASON}/${e.code}`}>{e.name}</a>
                </td>
                <td>{e.official_rank ?? ""}</td>
                <td data-v={e.wins ?? 0}>{e.played ? wlt(e.wins ?? 0, e.losses ?? 0, e.ties ?? 0) : ""}</td>
                <td class="w">{f1(e.opr_np)}</td>
                <td>{f1(e.opr_auto)}</td>
                <td>{f1(e.opr_teleop)}</td>
                <td>{f2(e.opr_tips)}</td>
                <td>{f1(e.opr_flower)}</td>
                <td>{f1(e.opr_garden)}</td>
                <td>{f1(e.ccwm)}</td>
                <td>{f1(e.avg_np)}</td>
                <td>{e.max_np ?? ""}</td>
                <td>{f2(e.rp_avg)}</td>
              </tr>
            ))}
          </tbody>
          {played.length > 1 && (
            <tfoot>
              <tr>
                <td class="l" colspan={3}>
                  Season
                </td>
                <td>{wlt(tot("wins"), tot("losses"), tot("ties"))}</td>
                <td>{f1(bestNp)}</td>
                <td colspan={9} class="l note">
                  best event
                </td>
              </tr>
            </tfoot>
          )}
        </Table>

        <h2 id="matches">Match Log</h2>
        {log.length === 0 ? (
          <p class="note">No matches yet this season.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <th class="l">Event</th>
                <th class="l">Match</th>
                <th class="l">Res</th>
                <th>Score</th>
                <th class="l">Partner(s)</th>
                <th class="l">Opponents</th>
                <th>Own NP</th>
                <th>Opp NP</th>
              </tr>
            </thead>
            <tbody>
              {log.map((m) => {
                const mine = m.alliance;
                const entries = (m.teams ?? "").split(",").map((s) => {
                  const [st, t] = s.split(":");
                  return { ally: (st ?? "").startsWith("Red") ? "R" : "B", team: Number(t) };
                });
                const partners = entries.filter((e) => e.ally === mine && e.team !== n);
                const opps = entries.filter((e) => e.ally !== mine);
                const own = mine === "R" ? m.red_score : m.blue_score;
                const opp = mine === "R" ? m.blue_score : m.red_score;
                const res = !m.played ? "" : m.winner === "T" ? "T" : m.winner === mine ? "W" : "L";
                const links = (xs: { team: number }[]) =>
                  xs.map((x, i) => (
                    <>
                      {i > 0 && " "}
                      <a href={`/teams/${x.team}`}>{x.team}</a>
                    </>
                  ));
                return (
                  <tr>
                    <td class="l">
                      <a href={`/events/${SEASON}/${m.event_code}`}>{m.event_code}</a>
                    </td>
                    <td class="l">
                      <a
                        href={`/events/${SEASON}/${m.event_code}/${matchSlug(m.level, m.series, m.match_number)}`}
                      >
                        {matchLabel(m.level, m.series, m.match_number)}
                      </a>
                    </td>
                    <td class={`l${res === "W" ? " w" : ""}`}>{res}</td>
                    <td data-v={own ?? ""}>{m.played ? `${own}–${opp}` : ""}</td>
                    <td class="l">{links(partners)}</td>
                    <td class="l">{links(opps)}</td>
                    <td>{(mine === "R" ? m.red_np : m.blue_np) ?? ""}</td>
                    <td>{(mine === "R" ? m.blue_np : m.red_np) ?? ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}

        <h2 id="awards">Awards</h2>
        {awards.length === 0 ? (
          <p class="note">None this season.</p>
        ) : (
          <ul>
            {awards.map((a) => (
              <li>
                {a.name} — <a href={`/events/${SEASON}/${a.event_code}`}>{a.event_name}</a>
              </li>
            ))}
          </ul>
        )}
      </Layout>,
    );
  }),
);
