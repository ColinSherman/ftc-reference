import { Hono } from "hono";
import { cached, VERSIONED_TTL } from "../cache";
import { db, type Env, matchLabel, matchSlug } from "../env";
import { f1, f2, fmtDateRange, Layout, Table, wlt } from "../views/layout";

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
  scheduled_at: string | null;
  teams: string; // "Red1:123,Red2:456,…"
}

export const eventRoutes = new Hono<{ Bindings: Env }>();

eventRoutes.get("/:season{[0-9]{4}}", (c) =>
  cached(c, { ttl: 600 }, async () => {
    const season = Number(c.req.param("season"));
    const { results } = await db(c)
      .prepare(
        `SELECT e.code, e.name, e.type_name, e.city, e.state_prov, e.country, e.date_start, e.date_end,
                (SELECT COUNT(*) FROM event_teams t WHERE t.season = e.season AND t.event_code = e.code) AS teams
         FROM events e WHERE e.season = ? ORDER BY e.date_start, e.name`,
      )
      .bind(season)
      .all<EventRow & { teams: number }>();
    return c.html(
      <Layout title={`${season} Events`}>
        <h1>
          {season}–{String(season + 1).slice(2)} Events
        </h1>
        <p class="note">{results.length} events. Click a column to sort.</p>
        <Table>
          <thead>
            <tr>
              <th class="l">Dates</th>
              <th class="l">Event</th>
              <th class="l">Type</th>
              <th class="l">Location</th>
              <th>Teams</th>
            </tr>
          </thead>
          <tbody>
            {results.map((e) => (
              <tr>
                <td class="l" data-v={e.date_start}>
                  {fmtDateRange(e.date_start, e.date_end)}
                </td>
                <td class="l">
                  <a href={`/events/${season}/${e.code}`}>{e.name}</a>
                </td>
                <td class="l">{e.type_name}</td>
                <td class="l">{[e.city, e.state_prov, e.country].filter(Boolean).join(", ")}</td>
                <td>{e.teams || ""}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Layout>,
    );
  }),
);

eventRoutes.get("/:season{[0-9]{4}}/:code", (c) => {
  const season = Number(c.req.param("season"));
  const code = c.req.param("code").toUpperCase();
  return cached(c, { versions: [`event:${season}:${code}`], ttl: VERSIONED_TTL }, async () => {
    const d = db(c);
    const [evR, rankR, matchR, statR, allyR, awardR] = await d.batch([
      d.prepare("SELECT * FROM events WHERE season = ? AND code = ?").bind(season, code),
      d
        .prepare(
          `SELECT r.*, t.name_short, s.opr_np FROM rankings r
           LEFT JOIN teams t ON t.number = r.team
           LEFT JOIN s2026_team_event_stats s ON s.event_code = r.event_code AND s.team = r.team
           WHERE r.season = ? AND r.event_code = ? ORDER BY r.rank`,
        )
        .bind(season, code),
      d
        .prepare(
          `SELECT m.id, m.level, m.series, m.match_number, m.red_score, m.blue_score, m.red_np, m.blue_np,
                  m.winner, m.played, m.scheduled_at,
                  (SELECT group_concat(station || ':' || team) FROM match_teams mt WHERE mt.match_id = m.id) AS teams
           FROM matches m WHERE m.season = ? AND m.event_code = ?
           ORDER BY CASE m.level WHEN 'Q' THEN 0 ELSE 1 END, m.series, m.match_number`,
        )
        .bind(season, code),
      d
        .prepare(
          `SELECT s.*, t.name_short FROM s2026_team_event_stats s LEFT JOIN teams t ON t.number = s.team
           WHERE s.event_code = ? ORDER BY s.opr_np DESC`,
        )
        .bind(code),
      d
        .prepare("SELECT * FROM alliances WHERE season = ? AND event_code = ? ORDER BY number")
        .bind(season, code),
      d
        .prepare(
          `SELECT a.*, t.name_short FROM awards a LEFT JOIN teams t ON t.number = a.team
           WHERE a.season = ? AND a.event_code = ? ORDER BY a.award_id, a.series`,
        )
        .bind(season, code),
    ]);
    const ev = evR?.results[0] as EventRow | undefined;
    if (!ev)
      return c.html(
        <Layout title="Event not found">
          <h1>Event {code} not found</h1>
        </Layout>,
        404,
      );

    type Rank = {
      team: number;
      name_short: string | null;
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
    type Stat = Record<string, number | null> & { team: number; name_short: string | null };
    const ranks = rankR?.results as Rank[];
    const matches = matchR?.results as MatchRow[];
    const stats = statR?.results as unknown as Stat[];
    const allys = allyR?.results as {
      number: number;
      captain: number | null;
      pick1: number | null;
      pick2: number | null;
      backup: number | null;
    }[];
    const awards = awardR?.results as {
      name: string;
      team: number;
      name_short: string | null;
      person_name: string | null;
    }[];

    return c.html(
      <Layout
        title={`${ev.name} (${season})`}
        description={`Rankings, match results and OPR for ${ev.name}.`}
      >
        <div class="crumbs">
          <a href={`/events/${season}`}>{season} Events</a> › {code}
        </div>
        <h1>{ev.name}</h1>
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
          <div>
            <a href={`https://ftc-events.firstinspires.org/${season}/${code}`}>FIRST event page</a>
          </div>
        </div>
        <div class="tabs">
          <a href="#rankings">Rankings</a>
          <a href="#matches">Matches</a>
          <a href="#stats">Team Stats</a>
          <a href="#alliances">Alliances</a>
          <a href="#awards">Awards</a>
        </div>

        <h2 id="rankings">Rankings</h2>
        {ranks.length === 0 ? (
          <p class="note">No rankings yet.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Rk</th>
                <th>Team</th>
                <th class="l">Name</th>
                <th>W-L-T</th>
                <th>RS</th>
                <th>TB1</th>
                <th>TB2</th>
                <th>Pl</th>
                <th>NP OPR</th>
              </tr>
            </thead>
            <tbody>
              {ranks.map((r) => (
                <tr>
                  <td>{r.rank}</td>
                  <td>
                    <a href={`/teams/${r.team}`}>{r.team}</a>
                  </td>
                  <td class="l">{r.name_short}</td>
                  <td data-v={r.wins + r.ties / 2}>{wlt(r.wins, r.losses, r.ties)}</td>
                  <td>{f2(r.sort1)}</td>
                  <td>{f2(r.sort2)}</td>
                  <td>{f2(r.sort3)}</td>
                  <td>{r.played}</td>
                  <td>{f1(r.opr_np)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}

        <h2 id="matches">Matches</h2>
        {matches.length === 0 ? (
          <p class="note">Schedule not published yet.</p>
        ) : (
          <MatchTable season={season} code={code} matches={matches} />
        )}

        <h2 id="stats">Team Stats</h2>
        {stats.length === 0 ? (
          <p class="note">Stats appear after the first scored qualification match.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Team</th>
                <th class="l">Name</th>
                <th>W-L-T</th>
                <th>NP OPR</th>
                <th>Auto</th>
                <th>TeleOp</th>
                <th>Tips</th>
                <th>Hive</th>
                <th>Flower</th>
                <th>Garden</th>
                <th>Park</th>
                <th>DPR</th>
                <th>CCWM</th>
                <th>Avg NP</th>
                <th>Max NP</th>
                <th>RP/M</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((s) => (
                <tr>
                  <td>
                    <a href={`/teams/${s.team}`}>{s.team}</a>
                  </td>
                  <td class="l">{s.name_short}</td>
                  <td data-v={s.wins}>{wlt(s.wins ?? 0, s.losses ?? 0, s.ties ?? 0)}</td>
                  <td class="w">{f1(s.opr_np)}</td>
                  <td>{f1(s.opr_auto)}</td>
                  <td>{f1(s.opr_teleop)}</td>
                  <td>{f2(s.opr_tips)}</td>
                  <td>{f1(s.opr_hive)}</td>
                  <td>{f1(s.opr_flower)}</td>
                  <td>{f1(s.opr_garden)}</td>
                  <td>{f1(s.opr_park)}</td>
                  <td>{f1(s.dpr)}</td>
                  <td>{f1(s.ccwm)}</td>
                  <td>{f1(s.avg_np)}</td>
                  <td>{s.max_np}</td>
                  <td>{f2(s.rp_avg)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}

        <h2 id="alliances">Alliances</h2>
        {allys.length === 0 ? (
          <p class="note">Alliance selection has not happened yet.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>#</th>
                <th>Captain</th>
                <th>Pick 1</th>
                <th>Pick 2</th>
                <th>Backup</th>
              </tr>
            </thead>
            <tbody>
              {allys.map((a) => (
                <tr>
                  <td>{a.number}</td>
                  {[a.captain, a.pick1, a.pick2, a.backup].map((t) => (
                    <td>{t ? <a href={`/teams/${t}`}>{t}</a> : ""}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </Table>
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
                  <td>{a.team ? <a href={`/teams/${a.team}`}>{a.team}</a> : ""}</td>
                  <td class="l">{a.person_name ?? a.name_short}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Layout>,
    );
  });
});

function MatchTable(props: { season: number; code: string; matches: MatchRow[] }) {
  const side = (teams: string, ally: "Red" | "Blue") =>
    teams
      .split(",")
      .filter((s) => s.startsWith(ally))
      .sort()
      .map((s) => Number(s.split(":")[1]));
  return (
    <Table>
      <thead>
        <tr>
          <th class="l">Match</th>
          <th>Red</th>
          <th>Blue</th>
          <th>Red</th>
          <th>Blue</th>
          <th>Red NP</th>
          <th>Blue NP</th>
        </tr>
      </thead>
      <tbody>
        {props.matches.map((m) => {
          const red = side(m.teams ?? "", "Red");
          const blue = side(m.teams ?? "", "Blue");
          const teamLinks = (ts: number[]) =>
            ts.map((t, i) => (
              <>
                {i > 0 && " "}
                <a href={`/teams/${t}`}>{t}</a>
              </>
            ));
          return (
            <tr>
              <td class="l" data-v={(m.level === "Q" ? 0 : 1000) + m.series * 10 + m.match_number}>
                <a
                  href={`/events/${props.season}/${props.code}/${matchSlug(m.level, m.series, m.match_number)}`}
                >
                  {matchLabel(m.level, m.series, m.match_number)}
                </a>
              </td>
              <td class="r">{teamLinks(red)}</td>
              <td class="b">{teamLinks(blue)}</td>
              <td class={`r${m.winner === "R" ? " w" : ""}`}>{m.played ? m.red_score : ""}</td>
              <td class={`b${m.winner === "B" ? " w" : ""}`}>{m.played ? m.blue_score : ""}</td>
              <td>{m.red_np ?? ""}</td>
              <td>{m.blue_np ?? ""}</td>
            </tr>
          );
        })}
      </tbody>
    </Table>
  );
}
