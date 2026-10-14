import { Hono } from "hono";
import { cached } from "./cache";
import { db, type Env, SEASON } from "./env";
import { eventRoutes } from "./routes/event";
import { matchRoutes } from "./routes/match";
import { teamRoutes } from "./routes/team";
import { f1, f2, fmtDateRange, Layout, Table, wlt } from "./views/layout";

const app = new Hono<{ Bindings: Env }>({ strict: false });

// One canonical host, so the edge cache and search engines see a single copy of each page.
app.use("*", async (c, next) => {
  const url = new URL(c.req.url);
  if (url.hostname === "www.ftc-reference.com") {
    url.hostname = "ftc-reference.com";
    return c.redirect(url.toString(), 301);
  }
  await next();
});

app.route("/teams", teamRoutes);
app.route("/events", eventRoutes);
app.route("/events", matchRoutes);

app.get("/", (c) =>
  cached(c, { ttl: 60 }, async () => {
    const d = db(c);
    const today = new Date().toISOString().slice(0, 10);
    const [evR, topR] = await d.batch([
      d
        .prepare(
          `SELECT code, name, city, state_prov, country, date_start, date_end FROM events
           WHERE season = ? AND substr(date_end, 1, 10) >= date(?, '-3 days') AND substr(date_start, 1, 10) <= date(?, '+7 days')
           ORDER BY date_start, name LIMIT 60`,
        )
        .bind(SEASON, today, today),
      d.prepare(
        `SELECT s.team, t.name_short, s.best_opr_np, s.best_event, s.wins, s.losses, s.ties FROM s2026_team_season_stats s
           LEFT JOIN teams t ON t.number = s.team ORDER BY s.best_opr_np DESC LIMIT 25`,
      ),
    ]);
    const events = evR?.results as {
      code: string;
      name: string;
      city: string | null;
      state_prov: string | null;
      country: string | null;
      date_start: string;
      date_end: string;
    }[];
    const top = topR?.results as {
      team: number;
      name_short: string | null;
      best_opr_np: number;
      best_event: string;
      wins: number;
      losses: number;
      ties: number;
    }[];

    return c.html(
      <Layout
        title="FTC Stats, Scores & Scouting"
        description="Fast, dense FIRST Tech Challenge stats: OPR, match results, rankings and scouting for BIOBUZZ."
      >
        <h1>
          FIRST Tech Challenge — BIOBUZZ {SEASON}–{String(SEASON + 1).slice(2)}
        </h1>
        <h2>This Week</h2>
        {events.length === 0 ? (
          <p class="note">No events this week.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <th class="l">Dates</th>
                <th class="l">Event</th>
                <th class="l">Location</th>
                <th class="l"> </th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => {
                const live = e.date_start.slice(0, 10) <= today && e.date_end.slice(0, 10) >= today;
                return (
                  <tr>
                    <td class="l" data-v={e.date_start}>
                      {fmtDateRange(e.date_start, e.date_end)}
                    </td>
                    <td class="l">
                      <a href={`/events/${SEASON}/${e.code}`}>{e.name}</a>
                    </td>
                    <td class="l">{[e.city, e.state_prov, e.country].filter(Boolean).join(", ")}</td>
                    <td class="l">{live && <span class="pill live">LIVE</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
        <h2>Top Teams by NP OPR</h2>
        <Table>
          <thead>
            <tr>
              <th>#</th>
              <th>Team</th>
              <th class="l">Name</th>
              <th>NP OPR</th>
              <th class="l">Best Event</th>
              <th>W-L-T</th>
            </tr>
          </thead>
          <tbody>
            {top.map((t, i) => (
              <tr>
                <td>{i + 1}</td>
                <td>
                  <a href={`/teams/${t.team}`}>{t.team}</a>
                </td>
                <td class="l">{t.name_short}</td>
                <td class="w">{f1(t.best_opr_np)}</td>
                <td class="l">
                  <a href={`/events/${SEASON}/${t.best_event}`}>{t.best_event}</a>
                </td>
                <td data-v={t.wins}>{wlt(t.wins, t.losses, t.ties)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
        <p>
          <a href={`/seasons/${SEASON}/leaders`}>Full leaderboard »</a>
        </p>
      </Layout>,
    );
  }),
);

const LEADER_SORTS: Record<string, string> = {
  np: "best_opr_np",
  latest: "latest_opr_np",
  auto: "best_opr_auto",
  teleop: "best_opr_teleop",
  tips: "best_opr_tips",
  flower: "best_opr_flower",
  maxnp: "best_np",
};

app.get("/seasons/:season{[0-9]{4}}/leaders", (c) =>
  cached(c, { ttl: 300 }, async () => {
    const sortKey = c.req.query("sort") ?? "np";
    const col = LEADER_SORTS[sortKey] ?? "best_opr_np";
    const { results } = await db(c)
      .prepare(
        `SELECT s.*, t.name_short, t.state_prov, t.country FROM s2026_team_season_stats s
         LEFT JOIN teams t ON t.number = s.team
         WHERE s.${col} IS NOT NULL ORDER BY s.${col} DESC LIMIT 1000`,
      )
      .all<Record<string, number | string | null> & { team: number }>();
    const n = (v: unknown) => v as number | null;
    return c.html(
      <Layout title={`${SEASON} Leaders`}>
        <h1>{SEASON} Team Leaders</h1>
        <p class="note">
          Sorted by:{" "}
          {Object.keys(LEADER_SORTS).map((k) => (
            <>{k === sortKey ? <b>{k}</b> : <a href={`?sort=${k}`}>{k}</a>} </>
          ))}
          · Best = best single-event OPR. Top 1,000 shown; click headers to re-sort.
        </p>
        <Table>
          <thead>
            <tr>
              <th>#</th>
              <th>Team</th>
              <th class="l">Name</th>
              <th class="l">Loc</th>
              <th>Ev</th>
              <th>W-L-T</th>
              <th>Best NP</th>
              <th>Latest NP</th>
              <th>Auto</th>
              <th>TeleOp</th>
              <th>Tips</th>
              <th>Flower</th>
              <th>Max NP</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r, i) => (
              <tr>
                <td>{i + 1}</td>
                <td>
                  <a href={`/teams/${r.team}`}>{r.team}</a>
                </td>
                <td class="l">{r.name_short}</td>
                <td class="l">{[r.state_prov, r.country].filter(Boolean).join(", ")}</td>
                <td>{r.events_played}</td>
                <td data-v={r.wins}>{wlt(n(r.wins) ?? 0, n(r.losses) ?? 0, n(r.ties) ?? 0)}</td>
                <td class="w">{f1(n(r.best_opr_np))}</td>
                <td>{f1(n(r.latest_opr_np))}</td>
                <td>{f1(n(r.best_opr_auto))}</td>
                <td>{f1(n(r.best_opr_teleop))}</td>
                <td>{f2(n(r.best_opr_tips))}</td>
                <td>{f1(n(r.best_opr_flower))}</td>
                <td>{r.best_np ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Layout>,
    );
  }),
);

app.get("/search", async (c) => {
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
              "SELECT number, name_short, city, state_prov FROM teams WHERE name_short LIKE ? ORDER BY number LIMIT 50",
            )
            .bind(like),
          d
            .prepare(
              "SELECT code, name, date_start FROM events WHERE season = ? AND name LIKE ? ORDER BY date_start LIMIT 50",
            )
            .bind(SEASON, like),
        ]);
  const teams = (tR?.results ?? []) as {
    number: number;
    name_short: string;
    city: string | null;
    state_prov: string | null;
  }[];
  const events = (eR?.results ?? []) as { code: string; name: string; date_start: string }[];
  return c.html(
    <Layout title={`Search: ${q}`}>
      <h1>Search: “{q}”</h1>
      <h2>Teams ({teams.length})</h2>
      <ul>
        {teams.map((t) => (
          <li>
            <a href={`/teams/${t.number}`}>
              {t.number} {t.name_short}
            </a>{" "}
            <span class="note">{[t.city, t.state_prov].filter(Boolean).join(", ")}</span>
          </li>
        ))}
      </ul>
      <h2>Events ({events.length})</h2>
      <ul>
        {events.map((e) => (
          <li>
            <a href={`/events/${SEASON}/${e.code}`}>{e.name}</a>{" "}
            <span class="note">{e.date_start.slice(0, 10)}</span>
          </li>
        ))}
      </ul>
    </Layout>,
  );
});

app.notFound((c) =>
  c.html(
    <Layout title="Not found">
      <h1>Page not found</h1>
      <p>
        <a href="/">Home</a>
      </p>
    </Layout>,
    404,
  ),
);

export default app;
