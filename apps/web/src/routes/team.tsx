import { getSeason, isSeason, OFFICIAL_KINDS, officialKindIn, seasonLabel } from "@ftcref/seasons";
import { Hono } from "hono";
import { cached } from "../cache";
import { db, type Env, matchLabel, matchSlug, SEASON } from "../env";
import { regionName } from "../regions";
import { StatsScope, seasonStatsTable, statsMode } from "../statsScope";
import { f1, f2, fmtShortRange, Layout, Table, wlt } from "../views/layout";
import { Av, CompTh, Result, StatBox, TeamLinks, Th, VidCell } from "../views/ui";

export const teamRoutes = new Hono<{ Bindings: Env }>();

interface LogRow {
  event_code: string;
  event_name: string;
  remote: number;
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
  has_video: number;
  teams: string | null;
}

const OFFICIAL = new Set<string>(OFFICIAL_KINDS);

type Ev = Record<string, number | null> & {
  code: string;
  name: string;
  date_start: string;
  date_end: string;
  type_name: string | null;
  kind: string | null;
};

type Career = {
  season: number;
  game_name: string;
  events_played: number | null;
  wins: number | null;
  losses: number | null;
  ties: number | null;
  best_opr_np: number | null;
  best_opr_auto: number | null;
  best_event: string | null;
  best_np: number | null;
  world_rank: number | null;
  ranked: number | null;
  awards: number;
  team_name: string | null;
};

// Team pages span many events, so they use a short TTL rather than per-event versions.
teamRoutes.get("/:n{[0-9]+}", (c) =>
  cached(c, { ttl: 120 }, async () => {
    const n = Number(c.req.param("n"));
    const mode = statsMode(c);
    const table = seasonStatsTable(mode);
    const awardKind = mode === "official" ? `AND ${officialKindIn("ae")}` : "";
    const d = db(c);
    const [teamR, careerR] = await d.batch([
      d
        .prepare(
          "SELECT t.*, av.key AS av FROM teams t LEFT JOIN team_avatars av ON av.team = t.number WHERE t.number = ?",
        )
        .bind(n),
      // One row per season the team registered or played in.
      d
        .prepare(
          `SELECT y.year AS season, y.game_name, ts.name_short AS team_name,
                  s.events_played, s.wins, s.losses, s.ties, s.best_opr_np, s.best_opr_auto, s.best_event, s.best_np,
                  CASE WHEN s.best_opr_np IS NULL THEN NULL ELSE
                    (SELECT COUNT(*) FROM ${table} x WHERE x.season = y.year AND x.best_opr_np > s.best_opr_np) + 1 END AS world_rank,
                  (SELECT COUNT(*) FROM ${table} x WHERE x.season = y.year) AS ranked,
                  (SELECT COUNT(*) FROM awards a
                    JOIN events ae ON ae.season = a.season AND ae.code = a.event_code
                    WHERE a.season = y.year AND a.team = ?1 ${awardKind}) AS awards
           FROM seasons y
           LEFT JOIN team_seasons ts ON ts.season = y.year AND ts.number = ?1
           LEFT JOIN ${table} s ON s.season = y.year AND s.team = ?1
           WHERE ts.number IS NOT NULL OR s.team IS NOT NULL
           ORDER BY y.year DESC`,
        )
        .bind(n),
    ]);
    const team = teamR?.results[0] as
      | (Record<string, string | number | null> & { av: string | null })
      | undefined;
    if (!team) {
      return c.html(
        <Layout title="Team not found">
          <h1>Team {n} not found</h1>
          <p class="note">Teams appear once they register for a season we've synced.</p>
        </Layout>,
        404,
      );
    }
    const career = (careerR?.results ?? []) as Career[];
    const qSeason = Number(c.req.query("season"));
    const season = isSeason(qSeason) ? qSeason : (career.find((r) => r.events_played)?.season ?? SEASON);
    const desc = getSeason(season);

    const [tsR, evR, logR, awR] = await d.batch([
      d.prepare("SELECT * FROM team_seasons WHERE season = ? AND number = ?").bind(season, n),
      d
        .prepare(
          `SELECT e.code, e.name, e.date_start, e.date_end, e.type_name, e.kind, s.*, r.rank AS official_rank
           FROM event_teams et
           JOIN events e ON e.season = et.season AND e.code = et.event_code
           LEFT JOIN team_event_stats s ON s.season = et.season AND s.event_code = et.event_code AND s.team = et.team
           LEFT JOIN rankings r ON r.season = et.season AND r.event_code = et.event_code AND r.team = et.team
           WHERE et.season = ? AND et.team = ? ORDER BY e.date_start`,
        )
        .bind(season, n),
      d
        .prepare(
          `SELECT m.event_code, e.name AS event_name, e.remote, m.level, m.series, m.match_number, mt.alliance,
                  m.red_score, m.blue_score, m.red_np, m.blue_np, m.winner, m.played,
                  EXISTS (SELECT 1 FROM videos v WHERE v.match_id = m.id AND v.status = 'approved') AS has_video,
                  (SELECT group_concat(x.station || ':' || x.team || ':' || COALESCE(xa.key, '')) FROM match_teams x
                   LEFT JOIN team_avatars xa ON xa.team = x.team WHERE x.match_id = m.id) AS teams
           FROM match_teams mt
           JOIN matches m ON m.id = mt.match_id
           JOIN events e ON e.season = m.season AND e.code = m.event_code
           WHERE mt.team = ? AND m.season = ?
           ORDER BY e.date_start, CASE m.level WHEN 'Q' THEN 0 ELSE 1 END, m.series, m.match_number`,
        )
        .bind(n, season),
      d
        .prepare(
          `SELECT a.name, a.event_code, e.name AS event_name, e.kind FROM awards a
           JOIN events e ON e.season = a.season AND e.code = a.event_code
           WHERE a.team = ? AND a.season = ? ORDER BY e.date_start`,
        )
        .bind(n, season),
    ]);
    const ts = tsR?.results[0] as Record<string, string | null> | undefined;
    const allEvents = (evR?.results ?? []) as unknown as Ev[];
    const events =
      mode === "all" ? allEvents : allEvents.filter((e) => e.kind != null && OFFICIAL.has(e.kind));
    const hiddenEvents = allEvents.length - events.length;
    const shown = new Set(events.map((e) => e.code));
    const log = ((logR?.results ?? []) as LogRow[]).filter((m) => mode === "all" || shown.has(m.event_code));
    const awards = (
      (awR?.results ?? []) as { name: string; event_code: string; event_name: string; kind: string | null }[]
    ).filter((a) => mode === "all" || (a.kind != null && OFFICIAL.has(a.kind)));
    const ss = career.find((r) => r.season === season);
    const location = [team.city, team.state_prov, team.country].filter(Boolean).join(", ");

    const byEvent = new Map<string, LogRow[]>();
    for (const m of log) byEvent.set(m.event_code, [...(byEvent.get(m.event_code) ?? []), m]);
    const tot = (k: keyof Career) => career.reduce((s, r) => s + (Number(r[k]) || 0), 0);
    const yearsActive = career.filter((r) => r.events_played).length;

    return c.html(
      <Layout
        title={`Team ${n} ${team.name_short ?? ""}`}
        description={`FTC team ${n} ${team.name_short ?? ""}: OPR, records, match results and awards across ${career.length} seasons.`}
      >
        <div class="crumbs">
          <a href={`/seasons/${season}/leaders`}>Teams</a> › {n}
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
              {team.home_region && (
                <div>
                  <b>Region:</b> {regionName(String(team.home_region))}
                </div>
              )}
              {team.rookie_year && (
                <div>
                  <b>Rookie year:</b> {team.rookie_year}
                </div>
              )}
              {yearsActive > 0 && (
                <div>
                  <b>Seasons played:</b> {yearsActive}
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
                <a href={`https://ftc-events.firstinspires.org/team/${n}`}>FIRST team page</a>
              </div>
            </div>
            {team.name_full && <div class="note">{String(team.name_full).slice(0, 220)}</div>}
          </div>
        </div>

        <StatsScope url={c.req.url} mode={mode} hidden={hiddenEvents} />

        <h2 id="career">Career</h2>
        <Table>
          <thead>
            <tr>
              <th class="l">Season</th>
              <th class="l">Game</th>
              <Th k="Ev" />
              <Th k="W-L-T" />
              <Th k="Best NP" />
              <th title="World rank by best NP OPR that season">Rank</th>
              <Th k="Auto" />
              <Th k="Max NP" />
              <th>Awards</th>
              <th class="l">Best event</th>
            </tr>
          </thead>
          <tbody>
            {career.map((r) => (
              <tr style={r.season === season ? "background:var(--hi)" : undefined}>
                <td class="l" data-v={r.season}>
                  <a href={`/teams/${n}?season=${r.season}`}>{seasonLabel(r.season)}</a>
                </td>
                <td class="l">{r.game_name}</td>
                <td>{r.events_played ?? ""}</td>
                <td data-v={r.wins ?? 0}>
                  {r.events_played ? wlt(r.wins ?? 0, r.losses ?? 0, r.ties ?? 0) : ""}
                </td>
                <td class="w">{f1(r.best_opr_np)}</td>
                <td data-v={r.world_rank ?? 99999}>
                  {r.world_rank ? `#${r.world_rank.toLocaleString("en-US")}` : ""}
                  {r.world_rank && r.ranked ? (
                    <span class="note"> /{r.ranked.toLocaleString("en-US")}</span>
                  ) : (
                    ""
                  )}
                </td>
                <td>{f1(r.best_opr_auto)}</td>
                <td>{r.best_np ?? ""}</td>
                <td>{r.awards || ""}</td>
                <td class="l">
                  {r.best_event && <a href={`/events/${r.season}/${r.best_event}`}>{r.best_event}</a>}
                </td>
              </tr>
            ))}
          </tbody>
          {career.length > 1 && (
            <tfoot>
              <tr>
                <td class="l" colspan={2}>
                  {career.length} seasons
                </td>
                <td>{tot("events_played")}</td>
                <td>{wlt(tot("wins"), tot("losses"), tot("ties"))}</td>
                <td colspan={4} />
                <td>{tot("awards") || ""}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </Table>

        <h2 id="season">
          {seasonLabel(season)} · {desc.game}
          {ts?.name_short && ts.name_short !== team.name_short && (
            <span class="note"> (as “{ts.name_short}”)</span>
          )}
        </h2>
        <div class="tabs">
          {career.map((r) =>
            r.season === season ? (
              <b>{r.season}</b>
            ) : (
              <a href={`/teams/${n}?season=${r.season}#season`}>{r.season}</a>
            ),
          )}
        </div>
        {ss?.events_played ? (
          <div class="sbr">
            <StatBox
              label="Record"
              value={wlt(ss.wins ?? 0, ss.losses ?? 0, ss.ties ?? 0)}
              sub={`${ss.events_played} event${ss.events_played === 1 ? "" : "s"}`}
            />
            <StatBox
              label="Best NP OPR"
              value={f1(ss.best_opr_np)}
              sub={
                <>
                  #{(ss.world_rank ?? 0).toLocaleString("en-US")} of{" "}
                  {(ss.ranked ?? 0).toLocaleString("en-US")} ·{" "}
                  <a href={`/events/${season}/${ss.best_event}`}>{ss.best_event}</a>
                </>
              }
              tip="Best single-event no-penalty OPR; rank is among all teams with stats that season"
            />
            <StatBox label="Best match NP" value={ss.best_np ?? "–"} />
            {ts?.robot_name && (
              <StatBox label="Robot" value={<span style="font-size:16px">{ts.robot_name}</span>} />
            )}
            {awards.length > 0 && <StatBox label="Awards" value={awards.length} />}
          </div>
        ) : (
          <p class="note">No match results for this season{ts ? " (registered)" : ""}.</p>
        )}

        {events.length > 0 && (
          <>
            <h3>Events</h3>
            <Table>
              <thead>
                <tr>
                  <th class="l">Event</th>
                  <Th k="Rk" />
                  <Th k="W-L-T" />
                  <Th k="NP OPR" />
                  <Th k="Auto" />
                  <Th k="TeleOp" />
                  <Th k="Endgame" />
                  {desc.components.map((comp) => (
                    <CompTh c={comp} />
                  ))}
                  <Th k="Avg NP" />
                  <Th k="Max NP" />
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr>
                    <td class="l wrap" data-v={e.date_start}>
                      <a href={`/events/${season}/${e.code}`}>{e.name}</a>
                      <div class="sub">{fmtShortRange(e.date_start, e.date_end)}</div>
                    </td>
                    <td>{e.official_rank ?? ""}</td>
                    <td data-v={e.wins ?? 0}>
                      {e.played ? wlt(e.wins ?? 0, e.losses ?? 0, e.ties ?? 0) : ""}
                    </td>
                    <td class="w">{f1(e.opr_np)}</td>
                    <td>{f1(e.opr_auto)}</td>
                    <td>{f1(e.opr_teleop)}</td>
                    <td>{f1(e.opr_endgame)}</td>
                    {desc.components.map((comp) => (
                      <td>{(comp.count ? f2 : f1)(e[`opr_${comp.key}`])}</td>
                    ))}
                    <td>{f1(e.avg_np)}</td>
                    <td>{e.max_np ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </>
        )}

        {log.length > 0 && <h3 id="matches">Match Log</h3>}
        {[...byEvent].map(([code, ms]) => (
          <>
            <h3 style="font-size:14px">
              <a href={`/events/${season}/${code}`}>{ms[0]?.event_name}</a>
            </h3>
            <MatchLog team={n} season={season} rows={ms} />
          </>
        ))}

        {awards.length > 0 && (
          <>
            <h3 id="awards">Awards</h3>
            <ul>
              {awards.map((a) => (
                <li>
                  {a.name} — <a href={`/events/${season}/${a.event_code}`}>{a.event_name}</a>
                </li>
              ))}
            </ul>
          </>
        )}
      </Layout>,
    );
  }),
);

function MatchLog(props: { team: number; season: number; rows: LogRow[] }) {
  const remote = !!props.rows[0]?.remote;
  return (
    <Table>
      <thead>
        <tr>
          <th class="vc" title="Video" />
          <th class="l">Match</th>
          {!remote && (
            <th class="l" title="Result">
              Res
            </th>
          )}
          <th>Score</th>
          {!remote && <th class="l">Partner(s)</th>}
          {!remote && <th class="l">Opponents</th>}
          <Th k="Own NP" />
          {!remote && <Th k="Opp NP" />}
        </tr>
      </thead>
      <tbody>
        {props.rows.map((m) => {
          const mine = m.alliance;
          const entries = (m.teams ?? "").split(",").map((s) => {
            const [st, t, av] = s.split(":");
            return { ally: (st ?? "").startsWith("Red") ? "R" : "B", team: Number(t), av: av || null };
          });
          const partners = entries.filter((e) => e.ally === mine && e.team !== props.team);
          const opps = entries.filter((e) => e.ally !== mine);
          const own = mine === "R" ? m.red_score : m.blue_score;
          const opp = mine === "R" ? m.blue_score : m.red_score;
          const res = !m.played || remote ? "" : m.winner === "T" ? "T" : m.winner === mine ? "W" : "L";
          const links = (xs: { team: number; av: string | null }[]) => (
            <TeamLinks teams={xs} season={props.season} />
          );
          const href = `/events/${props.season}/${m.event_code}/${matchSlug(m.level, m.series, m.match_number)}`;
          return (
            <tr>
              <VidCell href={href} has={m.has_video} />
              <td
                class="l"
                data-v={(m.level === "Q" ? 0 : 1000) + (remote ? 0 : m.series * 10) + m.match_number}
              >
                <a href={href}>{matchLabel(m.level, remote ? 0 : m.series, m.match_number)}</a>{" "}
                {!remote && <span style={`color:var(--${mine === "R" ? "red" : "blue"})`}>●</span>}
              </td>
              {!remote && (
                <td class="l" data-v={res}>
                  <Result r={res} />
                </td>
              )}
              <td data-v={own ?? ""}>{m.played ? (remote ? own : `${own}–${opp}`) : ""}</td>
              {!remote && <td class="l">{links(partners)}</td>}
              {!remote && <td class="l">{links(opps)}</td>}
              <td>{(mine === "R" ? m.red_np : m.blue_np) ?? ""}</td>
              {!remote && <td>{(mine === "R" ? m.blue_np : m.red_np) ?? ""}</td>}
            </tr>
          );
        })}
      </tbody>
    </Table>
  );
}
