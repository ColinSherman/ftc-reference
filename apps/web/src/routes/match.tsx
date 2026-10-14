import { biobuzz } from "@ftcref/seasons";
import { Hono } from "hono";
import { cached, VERSIONED_TTL } from "../cache";
import { db, type Env, matchLabel, parseMatchSlug } from "../env";
import { Flower, Layout } from "../views/layout";

export const matchRoutes = new Hono<{ Bindings: Env }>();

matchRoutes.get("/:season{[0-9]{4}}/:code/:slug", (c) => {
  const season = Number(c.req.param("season"));
  const code = c.req.param("code").toUpperCase();
  const key = parseMatchSlug(c.req.param("slug"));
  if (!key) return c.notFound();

  return cached(c, { versions: [`event:${season}:${code}`], ttl: VERSIONED_TTL }, async () => {
    const d = db(c);
    const m = await d
      .prepare(
        `SELECT m.*, e.name AS event_name FROM matches m JOIN events e ON e.season = m.season AND e.code = m.event_code
         WHERE m.season = ? AND m.event_code = ? AND m.level = ? AND m.series = ? AND m.match_number = ?`,
      )
      .bind(season, code, key.level, key.series, key.n)
      .first<
        Record<string, string | number | null> & { id: number; event_name: string; winner: string | null }
      >();
    if (!m)
      return c.html(
        <Layout title="Match not found">
          <h1>Match not found</h1>
        </Layout>,
        404,
      );

    const [teamsR, scoresR, videoR] = await d.batch([
      d
        .prepare(
          `SELECT mt.*, t.name_short FROM match_teams mt LEFT JOIN teams t ON t.number = mt.team
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
    const teams = teamsR?.results as {
      alliance: string;
      team: number;
      name_short: string | null;
      surrogate: number;
      dq: number;
      no_show: number;
    }[];
    const scores = scoresR?.results as Record<string, number | string>[];
    const red = scores.find((s) => s.alliance === "R");
    const blue = scores.find((s) => s.alliance === "B");
    const video = videoR?.results[0] as { video_id: string; start_s: number | null } | undefined;
    const label = matchLabel(key.level, key.series, key.n);

    const TeamList = (props: { ally: string }) => (
      <>
        {teams
          .filter((t) => t.alliance === props.ally)
          .map((t) => (
            <div>
              <a href={`/teams/${t.team}`}>{t.team}</a> {t.name_short}
              {t.surrogate ? <span class="pill">surrogate</span> : ""}
              {t.dq ? <span class="pill">DQ</span> : ""}
              {t.no_show ? <span class="pill">no show</span> : ""}
            </div>
          ))}
      </>
    );

    return c.html(
      <Layout title={`${label} – ${m.event_name}`}>
        <div class="crumbs">
          <a href={`/events/${season}`}>{season} Events</a> ›{" "}
          <a href={`/events/${season}/${code}`}>{m.event_name}</a> › {label}
        </div>
        <h1>
          {label}: <span style="color:var(--red)">{m.red_score ?? "–"}</span> –{" "}
          <span style="color:var(--blue)">{m.blue_score ?? "–"}</span>
        </h1>

        <div class="mx">
          <div>
            <h2>Score Breakdown</h2>
            {!red || !blue ? (
              <p class="note">Detailed scores not available yet.</p>
            ) : (
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
                    <tr>
                      <td class="r">
                        <TeamList ally="R" />
                      </td>
                      <td class="l">
                        <b>Teams</b>
                      </td>
                      <td class="b">
                        <TeamList ally="B" />
                      </td>
                    </tr>
                    {biobuzz.breakdown.map(([lbl, col, sub]) => (
                      <tr style={sub ? "font-weight:bold" : undefined}>
                        <td class="r">{red[col]}</td>
                        <td class="l">{lbl}</td>
                        <td class="b">{blue[col]}</td>
                      </tr>
                    ))}
                    {(
                      [
                        ["Red FLOWER", "flower_red"],
                        ["Blue FLOWER", "flower_blue"],
                        ["Scoring FLOWER", "flower_scoring"],
                        ["Audience FLOWER", "flower_audience"],
                      ] as const
                    ).map(([lbl, col]) => (
                      <tr>
                        <td colspan={3} style="text-align:center">
                          <span class="note">{lbl}:</span> <Flower s={String(red[col] ?? "")} />
                        </td>
                      </tr>
                    ))}
                    <tr>
                      <td class="r">{red.swarm_rp ? "✓" : ""}</td>
                      <td class="l">SWARM RP</td>
                      <td class="b">{blue.swarm_rp ? "✓" : ""}</td>
                    </tr>
                    <tr>
                      <td class="r">{red.pollinator1_rp ? "✓" : ""}</td>
                      <td class="l">POLLINATOR 1 RP</td>
                      <td class="b">{blue.pollinator1_rp ? "✓" : ""}</td>
                    </tr>
                    <tr>
                      <td class="r">{red.pollinator2_rp ? "✓" : ""}</td>
                      <td class="l">POLLINATOR 2 RP</td>
                      <td class="b">{blue.pollinator2_rp ? "✓" : ""}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
            <p class="note">
              FLOWER stacks shown bottom → top:{" "}
              <span class="fl">
                <i class="R">●</i>
              </span>{" "}
              red NECTAR,{" "}
              <span class="fl">
                <i class="B">●</i>
              </span>{" "}
              blue NECTAR,{" "}
              <span class="fl">
                <i class="P">•</i>
              </span>{" "}
              POLLEN.
            </p>
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
