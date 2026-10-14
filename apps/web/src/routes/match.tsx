import { biobuzz } from "@ftcref/seasons";
import { Hono } from "hono";
import { cached, VERSIONED_TTL } from "../cache";
import { db, type Env, matchLabel, matchSlug, parseMatchSlug } from "../env";
import { Layout } from "../views/layout";
import { Av } from "../views/ui";

export const matchRoutes = new Hono<{ Bindings: Env }>();

type TeamRow = {
  alliance: string;
  station: string;
  team: number;
  name_short: string | null;
  av: string | null;
  surrogate: number;
  dq: number;
  no_show: number;
};

matchRoutes.get("/:season{[0-9]{4}}/:code/:slug", (c) => {
  const season = Number(c.req.param("season"));
  const code = c.req.param("code").toUpperCase();
  const key = parseMatchSlug(c.req.param("slug"));
  if (!key) return c.notFound();

  return cached(c, { versions: [`event:${season}:${code}`], ttl: VERSIONED_TTL }, async () => {
    const d = db(c);
    const [mR, listR] = await d.batch([
      d
        .prepare(
          `SELECT m.*, e.name AS event_name FROM matches m JOIN events e ON e.season = m.season AND e.code = m.event_code
           WHERE m.season = ? AND m.event_code = ? AND m.level = ? AND m.series = ? AND m.match_number = ?`,
        )
        .bind(season, code, key.level, key.series, key.n),
      d
        .prepare(
          `SELECT level, series, match_number FROM matches WHERE season = ? AND event_code = ?
           ORDER BY CASE level WHEN 'Q' THEN 0 ELSE 1 END, series, match_number`,
        )
        .bind(season, code),
    ]);
    const m = mR?.results[0] as
      | (Record<string, string | number | null> & {
          id: number;
          event_name: string;
          winner: string | null;
          played: number;
        })
      | undefined;
    if (!m) {
      return c.html(
        <Layout title="Match not found">
          <h1>Match not found</h1>
        </Layout>,
        404,
      );
    }
    const list = listR?.results as { level: string; series: number; match_number: number }[];
    const idx = list.findIndex(
      (x) => x.level === key.level && x.series === key.series && x.match_number === key.n,
    );
    const prev = idx > 0 ? list[idx - 1] : undefined;
    const next = idx >= 0 ? list[idx + 1] : undefined;

    const [teamsR, scoresR, videoR] = await d.batch([
      d
        .prepare(
          `SELECT mt.*, t.name_short, av.key AS av FROM match_teams mt
           LEFT JOIN teams t ON t.number = mt.team
           LEFT JOIN team_avatars av ON av.team = mt.team
           WHERE mt.match_id = ? ORDER BY mt.station`,
        )
        .bind(m.id),
      d.prepare("SELECT * FROM s2026_match_scores WHERE match_id = ?").bind(m.id),
      d
        .prepare(
          "SELECT video_id, start_s FROM videos WHERE match_id = ? AND status = 'approved' ORDER BY votes DESC LIMIT 1",
        )
        .bind(m.id),
    ]);
    const teams = teamsR?.results as TeamRow[];
    const scores = scoresR?.results as Record<string, number | string>[];
    const red = scores.find((s) => s.alliance === "R");
    const blue = scores.find((s) => s.alliance === "B");
    const video = videoR?.results[0] as { video_id: string; start_s: number | null } | undefined;
    const label = matchLabel(key.level, key.series, key.n);
    const href = (x: { level: string; series: number; match_number: number }) =>
      `/events/${season}/${code}/${matchSlug(x.level, x.series, x.match_number)}`;

    const Side = (props: { ally: "R" | "B" }) => {
      const score = props.ally === "R" ? m.red_score : m.blue_score;
      const np = props.ally === "R" ? m.red_np : m.blue_np;
      return (
        <div class={`${props.ally === "R" ? "rs" : "bs"}${m.winner === props.ally ? " won" : ""}`}>
          <div class="pts">{m.played ? score : "–"}</div>
          {np != null && <div class="note">{np} without fouls</div>}
          <div class="tm">
            {teams
              .filter((t) => t.alliance === props.ally)
              .map((t) =>
                props.ally === "R" ? (
                  <div>
                    <Av team={t.team} k={t.av} />
                    <a href={`/teams/${t.team}`}>{t.team}</a> {t.name_short}
                    <Flags t={t} />
                  </div>
                ) : (
                  <div>
                    <Flags t={t} />
                    {t.name_short} <a href={`/teams/${t.team}`}>{t.team}</a>
                    <Av team={t.team} k={t.av} />
                  </div>
                ),
              )}
          </div>
        </div>
      );
    };

    return c.html(
      <Layout
        title={`${label} – ${m.event_name}`}
        description={`${label} at ${m.event_name}: score breakdown and teams.`}
      >
        <div class="crumbs">
          <a href={`/events/${season}`}>{season} Events</a> ›{" "}
          <a href={`/events/${season}/${code}#matches`}>{m.event_name}</a> › {label}
        </div>
        <h1>{label}</h1>
        <div class="mnav">
          {prev ? (
            <a href={href(prev)}>« {matchLabel(prev.level, prev.series, prev.match_number)}</a>
          ) : (
            <span />
          )}
          <a href={`/events/${season}/${code}#matches`}>All matches</a>
          {next && <a href={href(next)}>{matchLabel(next.level, next.series, next.match_number)} »</a>}
        </div>
        <div class="score">
          <Side ally="R" />
          <Side ally="B" />
        </div>

        <div class="mx">
          <div>
            <h2>Score Breakdown</h2>
            {!red || !blue ? (
              <p class="note">Detailed scores not available yet.</p>
            ) : (
              <>
                <div class="scroll">
                  <table class="st">
                    <thead>
                      <tr>
                        <th class="rh">Red</th>
                        <th class="l"> </th>
                        <th class="bh">Blue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {biobuzz.breakdown.map(([lbl, col, sub]) => {
                        const r = Number(red[col]);
                        const b = Number(blue[col]);
                        const fouls = col.includes("foul");
                        // Bold the better side of each row (fewer is better for fouls).
                        const rBetter = fouls ? r < b : r > b;
                        const bBetter = fouls ? b < r : b > r;
                        return (
                          <tr style={sub ? "font-weight:bold" : undefined}>
                            <td class={`r${rBetter ? " w" : ""}`}>{red[col]}</td>
                            <td class="l">{lbl}</td>
                            <td class={`b${bBetter ? " w" : ""}`}>{blue[col]}</td>
                          </tr>
                        );
                      })}
                      {(
                        [
                          ["SWARM RP", "swarm_rp"],
                          ["POLLINATOR 1 RP", "pollinator1_rp"],
                          ["POLLINATOR 2 RP", "pollinator2_rp"],
                        ] as const
                      ).map(([lbl, col]) => (
                        <tr>
                          <td class="r">{red[col] ? "✓" : ""}</td>
                          <td class="l">{lbl}</td>
                          <td class="b">{blue[col] ? "✓" : ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <h3>FLOWERS at match end</h3>
                <div class="fls">
                  {(
                    [
                      ["Red", "flower_red"],
                      ["Blue", "flower_blue"],
                      ["Scoring", "flower_scoring"],
                      ["Audience", "flower_audience"],
                    ] as const
                  ).map(([lbl, col]) => (
                    <div class="stk">
                      <div class="col">
                        {[...String(red[col] ?? "")].map((p) => (
                          <i
                            class={`ball ${p}`}
                            title={p === "R" ? "red NECTAR" : p === "B" ? "blue NECTAR" : "POLLEN"}
                          />
                        ))}
                      </div>
                      {lbl}
                    </div>
                  ))}
                </div>
                <p class="note">
                  Stacks drawn bottom → top: red / blue circles are NECTAR, small yellow circles are POLLEN.
                  The alliance with NECTAR on top owns the FLOWER.
                </p>
              </>
            )}
          </div>
          <div>
            <h2>Video</h2>
            {video ? (
              <iframe
                class="video"
                src={`https://www.youtube-nocookie.com/embed/${video.video_id}?start=${video.start_s ?? 0}`}
                loading="lazy"
                allowfullscreen
                title="Match video"
              />
            ) : (
              <div class="video none">No match video yet — submissions coming soon.</div>
            )}
          </div>
        </div>
      </Layout>,
    );
  });
});

function Flags(props: { t: TeamRow }) {
  return (
    <>
      {props.t.surrogate ? <span class="pill">surrogate</span> : ""}
      {props.t.dq ? <span class="pill">DQ</span> : ""}
      {props.t.no_show ? <span class="pill">no show</span> : ""}
    </>
  );
}
