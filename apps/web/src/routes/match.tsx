import { type ApiScore, getSeason, isSeason, seasonLabel } from "@ftcref/seasons";
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

const FLOWER_PIECE: Record<string, string> = { RED_NECTAR: "R", BLUE_NECTAR: "B", POLLEN: "P" };

matchRoutes.get("/:season{[0-9]{4}}/:code/:slug", (c) => {
  const season = Number(c.req.param("season"));
  if (!isSeason(season)) return c.notFound();
  const code = c.req.param("code").toUpperCase();
  const key = parseMatchSlug(c.req.param("slug"));
  if (!key) return c.notFound();

  return cached(c, { versions: [`event:${season}:${code}`], ttl: VERSIONED_TTL }, async () => {
    const desc = getSeason(season);
    const d = db(c);
    const [mR, listR] = await d.batch([
      d
        .prepare(
          `SELECT m.*, e.name AS event_name, e.remote FROM matches m
           JOIN events e ON e.season = m.season AND e.code = m.event_code
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
          remote: number;
        })
      | undefined;
    if (!m) {
      return c.html(
        <Layout title="Match not found">
          <h1>Match not found</h1>
          <p class="note">
            <a href={`/events/${season}/${code}#matches`}>Back to the event</a>
          </p>
        </Layout>,
        404,
      );
    }
    const remote = !!m.remote;
    // Prev/next stay within the same team's matches at remote events.
    const list = ((listR?.results ?? []) as { level: string; series: number; match_number: number }[]).filter(
      (x) => !remote || x.series === key.series,
    );
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
      d.prepare("SELECT alliance, np, detail FROM match_scores WHERE match_id = ?").bind(m.id),
      d
        .prepare(
          "SELECT video_id, start_s, title, channel_title FROM videos WHERE match_id = ? AND status = 'approved' ORDER BY votes DESC, id LIMIT 6",
        )
        .bind(m.id),
    ]);
    const teams = (teamsR?.results ?? []) as TeamRow[];
    const scores = (scoresR?.results ?? []) as { alliance: string; np: number; detail: string }[];
    const parse = (a: string) => {
      const s = scores.find((x) => x.alliance === a);
      try {
        return s ? (JSON.parse(s.detail) as ApiScore) : undefined;
      } catch {
        return undefined;
      }
    };
    const red = parse("R");
    const blue = parse("B");
    const videos = (videoR?.results ?? []) as {
      video_id: string;
      start_s: number | null;
      title: string | null;
      channel_title: string | null;
    }[];
    const video = videos[0];
    const addHref = `/videos/submit?match=${season}/${code}/${matchSlug(key.level, key.series, key.n)}`;
    const label = matchLabel(key.level, remote ? 0 : key.series, key.n);
    const href = (x: { level: string; series: number; match_number: number }) =>
      `/events/${season}/${code}/${matchSlug(x.level, x.series, x.match_number)}`;
    const navLabel = (x: { level: string; series: number; match_number: number }) =>
      matchLabel(x.level, remote ? 0 : x.series, x.match_number);

    const Side = (props: { ally: "R" | "B" }) => {
      const score = props.ally === "R" ? m.red_score : m.blue_score;
      const np = props.ally === "R" ? m.red_np : m.blue_np;
      const cls = remote ? "rs solo" : props.ally === "R" ? "rs" : "bs";
      return (
        <div class={`${cls}${m.winner === props.ally ? " won" : ""}`}>
          <div class="pts">{m.played ? score : "–"}</div>
          {np != null && np !== score && <div class="note">{np} without penalties</div>}
          <div class="tm">
            {teams
              .filter((t) => t.alliance === props.ally)
              .map((t) =>
                props.ally === "R" ? (
                  <div>
                    <Av team={t.team} k={t.av} />
                    <a href={`/teams/${t.team}?season=${season}`}>{t.team}</a> {t.name_short}
                    <Flags t={t} />
                  </div>
                ) : (
                  <div>
                    <Flags t={t} />
                    {t.name_short} <a href={`/teams/${t.team}?season=${season}`}>{t.team}</a>
                    <Av team={t.team} k={t.av} />
                  </div>
                ),
              )}
          </div>
        </div>
      );
    };

    const flowers = season === 2026 && red ? biobuzzFlowers(red) : null;

    return c.html(
      <Layout
        title={`${label} – ${m.event_name} (${seasonLabel(season)})`}
        description={`${label} at ${m.event_name}: ${desc.game} score breakdown and teams.`}
      >
        <div class="crumbs">
          <a href={`/events/${season}`}>
            {seasonLabel(season)} {desc.game}
          </a>{" "}
          › <a href={`/events/${season}/${code}#matches`}>{m.event_name}</a> › {label}
        </div>
        <h1>
          {label}
          {remote && <span class="note"> · team {key.series} (remote)</span>}
        </h1>
        <div class="mnav">
          {prev ? <a href={href(prev)}>« {navLabel(prev)}</a> : <span />}
          <a href={`/events/${season}/${code}#matches`}>All matches</a>
          {next && <a href={href(next)}>{navLabel(next)} »</a>}
        </div>
        <div class="score" style={remote ? "grid-template-columns:1fr;max-width:360px" : undefined}>
          <Side ally="R" />
          {!remote && <Side ally="B" />}
        </div>

        <div class="mx">
          <div>
            <h2>Score Breakdown</h2>
            {!red || (!remote && !blue) ? (
              <p class="note">Detailed scores not available for this match.</p>
            ) : (
              <>
                <div class="scroll">
                  <table class="st">
                    <thead>
                      <tr>
                        <th class={remote ? "" : "rh"}>{remote ? "Score" : "Red"}</th>
                        <th class="l"> </th>
                        {!remote && <th class="bh">Blue</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {desc.breakdown.map((row) => {
                        const rv = row.value(red);
                        const bv = blue ? row.value(blue) : null;
                        const numeric = typeof rv === "number" && typeof bv === "number";
                        const rBetter = numeric && (row.lower ? rv < bv : rv > bv);
                        const bBetter = numeric && (row.lower ? bv < rv : bv > rv);
                        return (
                          <tr style={row.sub ? "font-weight:bold" : undefined}>
                            <td class={`r${rBetter ? " w" : ""}`}>{rv}</td>
                            <td class="l">{row.label}</td>
                            {!remote && <td class={`b${bBetter ? " w" : ""}`}>{bv}</td>}
                          </tr>
                        );
                      })}
                      {(desc.rps ?? []).map((rp) => (
                        <tr>
                          <td class="r">{rp.value(red) ? "✓" : ""}</td>
                          <td class="l">{rp.label}</td>
                          {!remote && <td class="b">{blue && rp.value(blue) ? "✓" : ""}</td>}
                        </tr>
                      ))}
                      <tr style="font-weight:bold">
                        <td class="r">{desc.common(red).np}</td>
                        <td class="l">No-penalty total</td>
                        {!remote && <td class="b">{blue ? desc.common(blue).np : ""}</td>}
                      </tr>
                      <tr style="font-weight:bold">
                        <td class="r">{desc.common(red).total}</td>
                        <td class="l">Final</td>
                        {!remote && <td class="b">{blue ? desc.common(blue).total : ""}</td>}
                      </tr>
                    </tbody>
                  </table>
                </div>
                {desc.penaltiesDeducted && (
                  <p class="note">
                    This season, penalties were deducted from the offending alliance's own score.
                  </p>
                )}
                {flowers && (
                  <>
                    <h3>FLOWERS at match end</h3>
                    <div class="fls">
                      {flowers.map(([lbl, stack]) => (
                        <div class="stk">
                          <div class="col">
                            {[...stack].map((p) => (
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
                      Stacks drawn bottom → top: red / blue circles are NECTAR, small yellow circles are
                      POLLEN. The alliance with NECTAR on top owns the FLOWER.
                    </p>
                  </>
                )}
              </>
            )}
          </div>
          <div>
            <h2 id="video">Video</h2>
            {video ? (
              <>
                <iframe
                  class="video"
                  src={`https://www.youtube-nocookie.com/embed/${video.video_id}?start=${video.start_s ?? 0}`}
                  loading="lazy"
                  allowfullscreen
                  title={video.title ?? "Match video"}
                />
                <p class="note">
                  {video.channel_title && <>From {video.channel_title} · </>}
                  {videos.length > 1 &&
                    videos.slice(1).map((v, i) => (
                      <>
                        <a
                          href={`https://www.youtube.com/watch?v=${v.video_id}${v.start_s ? `&t=${v.start_s}` : ""}`}
                          rel="noopener"
                        >
                          Angle {i + 2}
                        </a>{" "}
                        ·{" "}
                      </>
                    ))}
                  <a href={addHref}>Add another video</a>
                </p>
              </>
            ) : (
              <div class="video none">
                No match video yet. <a href={addHref}>Add one</a> — or{" "}
                <a href="/videos/submit">import a whole playlist</a>.
              </div>
            )}
          </div>
        </div>
      </Layout>,
    );
  });
});

/** BIOBUZZ flower stacks (API order, bottom → top) encoded as R/B/P strings. */
function biobuzzFlowers(a: ApiScore): [string, string][] {
  const enc = (f: unknown) => (Array.isArray(f) ? f.map((p) => FLOWER_PIECE[String(p)] ?? "").join("") : "");
  return [
    ["Red", enc(a.redAllianceFlower)],
    ["Blue", enc(a.blueAllianceFlower)],
    ["Scoring", enc(a.scoringFlower)],
    ["Audience", enc(a.audienceFlower)],
  ];
}

function Flags(props: { t: TeamRow }) {
  return (
    <>
      {props.t.surrogate ? <span class="pill">surrogate</span> : ""}
      {props.t.dq ? <span class="pill">DQ</span> : ""}
      {props.t.no_show ? <span class="pill">no show</span> : ""}
    </>
  );
}
