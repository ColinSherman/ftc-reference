import { Hono } from "hono";
import { cached } from "../cache";
import { db, type Env, matchLabel, matchSlug, SEASON } from "../env";
import { f1, f2, fmtDateRange, Layout, Table, wlt } from "../views/layout";
import { Av, Result, StatBox, Th } from "../views/ui";

export const teamRoutes = new Hono<{ Bindings: Env }>();

interface LogRow {
  event_code: string;
  event_name: string;
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
  teams: string | null;
}

type Ev = Record<string, number | null> & {
  code: string;
  name: string;
  date_start: string;
  date_end: string;
  type_name: string | null;
};

// Team pages span many events, so they use a short TTL rather than per-event versions.
teamRoutes.get("/:n{[0-9]+}", (c) =>
  cached(c, { ttl: 120 }, async () => {
    const n = Number(c.req.param("n"));
    const d = db(c);
    const [teamR, tsR, seasonR, evR, logR, awR] = await d.batch([
      d
        .prepare(
          "SELECT t.*, av.key AS av FROM teams t LEFT JOIN team_avatars av ON av.team = t.number WHERE t.number = ?",
        )
        .bind(n),
      d.prepare("SELECT * FROM team_seasons WHERE season = ? AND number = ?").bind(SEASON, n),
      d
        .prepare(
          `SELECT s.*,
             (SELECT COUNT(*) FROM s2026_team_season_stats x WHERE x.best_opr_np > s.best_opr_np) + 1 AS world_rank,
             (SELECT COUNT(*) FROM s2026_team_season_stats) AS ranked,
             m.event_code AS bm_event, m.level AS bm_level, m.series AS bm_series, m.match_number AS bm_n
           FROM s2026_team_season_stats s LEFT JOIN matches m ON m.id = s.best_np_match_id
           WHERE s.team = ?`,
        )
        .bind(n),
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
          `SELECT m.event_code, e.name AS event_name, m.level, m.series, m.match_number, mt.alliance,
                  m.red_score, m.blue_score, m.red_np, m.blue_np, m.winner, m.played,
                  (SELECT group_concat(x.station || ':' || x.team) FROM match_teams x WHERE x.match_id = m.id) AS teams
           FROM match_teams mt
           JOIN matches m ON m.id = mt.match_id
           JOIN events e ON e.season = m.season AND e.code = m.event_code
           WHERE mt.team = ? AND m.season = ?
           ORDER BY e.date_start, CASE m.level WHEN 'Q' THEN 0 ELSE 1 END, m.series, m.match_number`,
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
    const team = teamR?.results[0] as
      | (Record<string, string | number | null> & { av: string | null })
      | undefined;
    if (!team) {
      return c.html(
        <Layout title="Team not found">
          <h1>Team {n} not found</h1>
          <p class="note">Teams appear once they register for the current season.</p>
        </Layout>,
        404,
      );
    }
    const ts = tsR?.results[0] as Record<string, string | null> | undefined;
    const ss = seasonR?.results[0] as
      | (Record<string, number | string | null> & { world_rank: number; ranked: number })
      | undefined;
    const events = evR?.results as unknown as Ev[];
    const log = logR?.results as LogRow[];
    const awards = awardsOf(awR?.results);
    const location = [team.city, team.state_prov, team.country].filter(Boolean).join(", ");
    const num = (v: unknown) => (typeof v === "number" ? v : null);

    // Group the match log by event, in event order.
    const byEvent = new Map<string, LogRow[]>();
    for (const m of log) byEvent.set(m.event_code, [...(byEvent.get(m.event_code) ?? []), m]);

    return c.html(
      <Layout
        title={`Team ${n} ${team.name_short ?? ""}`}
        description={`FTC team ${n} ${team.name_short ?? ""}: OPR, record, match results and awards for ${SEASON}–${String(SEASON + 1).slice(2)}.`}
      >
        <div class="crumbs">
          <a href={`/seasons/${SEASON}/leaders`}>Teams</a> › {n}
        </div>
        <div class="card">
          <Av team={n} k={team.av} size="xl" />
          <div class="who">
            <h1>
              {n} <span style="color:var(--muted)">·</span> {team.name_short}
            </h1>
            <div class="bio">
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
                  <a href={String(team.website)} rel="nofollow noopener">
                    Website
                  </a>
                </div>
              )}
              <div>
                <a href={`https://ftc-events.firstinspires.org/${SEASON}/team/${n}`}>FIRST team page</a>
              </div>
            </div>
            {team.name_full && <div class="note">{String(team.name_full).slice(0, 220)}</div>}
          </div>
        </div>
        {ss && (
          <div class="sbr">
            <StatBox
              label={`${SEASON}–${String(SEASON + 1).slice(2)} record`}
              value={wlt(num(ss.wins) ?? 0, num(ss.losses) ?? 0, num(ss.ties) ?? 0)}
              sub={`${ss.events_played} event${ss.events_played === 1 ? "" : "s"}`}
            />
            <StatBox
              label="Best NP OPR"
              value={f1(num(ss.best_opr_np))}
              sub={
                <>
                  #{ss.world_rank.toLocaleString("en-US")} of {ss.ranked.toLocaleString("en-US")} ·{" "}
                  <a href={`/events/${SEASON}/${ss.best_event}`}>{ss.best_event}</a>
                </>
              }
              tip="Best single-event no-penalty OPR; rank is among all teams with stats this season"
            />
            <StatBox label="Latest NP OPR" value={f1(num(ss.latest_opr_np))} sub={ss.latest_event} />
            <StatBox
              label="Best match NP"
              value={ss.best_np ?? "–"}
              sub={
                ss.bm_event && (
                  <a
                    href={`/events/${SEASON}/${ss.bm_event}/${matchSlug(String(ss.bm_level), num(ss.bm_series) ?? 0, num(ss.bm_n) ?? 0)}`}
                  >
                    {ss.bm_event} {matchLabel(String(ss.bm_level), num(ss.bm_series) ?? 0, num(ss.bm_n) ?? 0)}
                  </a>
                )
              }
            />
            {awards.length > 0 && <StatBox label="Awards" value={awards.length} />}
          </div>
        )}
        <div class="tabs">
          <a href="#events">Events</a>
          <a href="#matches">Match Log</a>
          <a href="#awards">Awards</a>
        </div>

        <h2 id="events">
          {SEASON}–{String(SEASON + 1).slice(2)} Events
        </h2>
        {events.length === 0 ? (
          <p class="note">Not registered for any events yet.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <th class="l">Dates</th>
                <th class="l">Event</th>
                <Th k="Rk" />
                <Th k="W-L-T" />
                <Th k="NP OPR" />
                <Th k="Auto" />
                <Th k="TeleOp" />
                <Th k="Tips" />
                <Th k="Flower" />
                <Th k="Garden" />
                <Th k="CCWM" />
                <Th k="Avg NP" />
                <Th k="Max NP" />
                <Th k="RP/M" />
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
          </Table>
        )}

        <h2 id="matches">Match Log</h2>
        {log.length === 0 ? (
          <p class="note">No matches yet this season.</p>
        ) : (
          [...byEvent].map(([code, ms]) => (
            <>
              <h3>
                <a href={`/events/${SEASON}/${code}`}>{ms[0]?.event_name}</a>
              </h3>
              <MatchLog team={n} rows={ms} />
            </>
          ))
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

function awardsOf(rows: unknown) {
  return (rows ?? []) as { name: string; event_code: string; event_name: string }[];
}

function MatchLog(props: { team: number; rows: LogRow[] }) {
  return (
    <Table>
      <thead>
        <tr>
          <th class="l">Match</th>
          <th class="l" title="Result">
            Res
          </th>
          <th>Score</th>
          <th class="l">Partner(s)</th>
          <th class="l">Opponents</th>
          <Th k="Own NP" />
          <Th k="Opp NP" />
        </tr>
      </thead>
      <tbody>
        {props.rows.map((m) => {
          const mine = m.alliance;
          const entries = (m.teams ?? "").split(",").map((s) => {
            const [st, t] = s.split(":");
            return { ally: (st ?? "").startsWith("Red") ? "R" : "B", team: Number(t) };
          });
          const partners = entries.filter((e) => e.ally === mine && e.team !== props.team);
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
              <td class="l" data-v={(m.level === "Q" ? 0 : 1000) + m.series * 10 + m.match_number}>
                <a href={`/events/${SEASON}/${m.event_code}/${matchSlug(m.level, m.series, m.match_number)}`}>
                  {matchLabel(m.level, m.series, m.match_number)}
                </a>{" "}
                <span
                  class={mine === "R" ? "r" : "b"}
                  style={`color:var(--${mine === "R" ? "red" : "blue"})`}
                >
                  ●
                </span>
              </td>
              <td class="l" data-v={res}>
                <Result r={res} />
              </td>
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
  );
}
