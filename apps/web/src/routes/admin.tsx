import { ALL_SEASONS, CURRENT_SEASON, isSeason, seasonLabel } from "@ftcref/seasons";
import { pacificDay } from "@ftcref/videos";
import { Hono } from "hono";
import type { Child } from "hono/jsx";
import { isAdmin } from "../admin";
import { type AppContext, type Env, matchLabel, matchSlug } from "../env";
import { Layout, Table } from "../views/layout";
import { ytFor } from "../yt";

export const adminRoutes = new Hono<{ Bindings: Env }>();

export const noStore = { "Cache-Control": "no-store" };
const YT_QUOTA = 10_000;
const MIN = 60_000;
const HOUR = 60 * MIN;

type Status = "ok" | "warn" | "fail" | "info";

/** FTC Events API jobs: their errors are what a bad FTC_API_* secret shows up as. */
const FTC_JOBS = "('events','teams','eventMatches','awards','leagues','leagueMembers')";
/** Queue retries (wrangler.jsonc max_retries 5): this many failed attempts in a row exhausts them. */
const ATTEMPTS = 6;

export function AdminNav(props: { active: "overview" | "videos" | "photos" | "runs"; env?: string }) {
  const link = (k: typeof props.active, href: string, label: string) =>
    props.active === k ? <b>{label}</b> : <a href={href}>{label}</a>;
  return (
    <div class="tabs">
      {link("overview", "/admin", "Overview")}
      {link("videos", "/admin/videos", "Videos")}
      {link("photos", "/admin/photos", "Photos")}
      {link("runs", "/admin/runs", "Sync log")}
      <span class={`pill env-${props.env ?? "local"}`} title="Which deployment's data you are looking at">
        {props.env ?? "local"}
      </span>
      <form method="post" action="/admin/logout" style="margin-left:auto">
        <button type="submit" class="go">
          Log out
        </button>
      </form>
    </div>
  );
}

function LoginPage() {
  return (
    <Layout title="Admin">
      <h1>Admin</h1>
      <form method="post" action="/admin/login" class="filters" style="max-width:420px">
        <label>
          Admin token
          <input name="token" type="password" required autocomplete="current-password" />
        </label>
        <button type="submit" class="go">
          Log in
        </button>
      </form>
    </Layout>
  );
}

export const ago = (iso: string | null | undefined) => {
  if (!iso) return "never";
  const ms = Date.now() - Date.parse(iso);
  if (ms < MIN) return `${Math.max(0, Math.round(ms / 1000))}s ago`;
  if (ms < HOUR) return `${Math.round(ms / MIN)}m ago`;
  if (ms < 48 * HOUR) return `${(ms / HOUR).toFixed(1)}h ago`;
  return `${Math.round(ms / (24 * HOUR))}d ago`;
};
const fmt = (n: number | null | undefined) => (n ?? 0).toLocaleString("en-US");

function Dot(props: { s: Status }) {
  const label = { ok: "OK", warn: "Check", fail: "Failing", info: "—" }[props.s];
  return <span class={`hs hs-${props.s}`}>● {label}</span>;
}

function Check(props: { name: string; s: Status; children: Child }) {
  return (
    <tr>
      <td class="l">
        <b>{props.name}</b>
      </td>
      <td class="l">
        <Dot s={props.s} />
      </td>
      <td class="l wrap">{props.children}</td>
    </tr>
  );
}

adminRoutes.get("/admin", async (c) => {
  if (!(await isAdmin(c))) return c.html(<LoginPage />, 200, noStore);
  return c.html(await overview(c), 200, noStore);
});

async function overview(c: AppContext) {
  // Read session: with D1 read replication these run on a replica, not the primary the site writes to.
  const db = c.env.DB.withSession("first-unconstrained");
  const since24 = new Date(Date.now() - 24 * HOUR).toISOString();
  const since1 = new Date(Date.now() - HOUR).toISOString();
  const since3d = new Date(Date.now() - 72 * HOUR).toISOString();
  const since7d = new Date(Date.now() - 168 * HOUR).toISOString();
  const today = new Date().toISOString().slice(0, 10);
  const day = pacificDay();
  const cmpYear = CURRENT_SEASON + 1;

  const [
    liveR,
    lastLiveR,
    ftcHourR,
    lastErrR,
    dailyR,
    seasonsR,
    avatarsR,
    usageR,
    usage7R,
    jobR,
    scanR,
    alignR,
    alignStateR,
    queueR,
    channelsR,
    activityR,
    updatedR,
    videosR,
    errorsR,
    ftcOkR,
    ftcAuthR,
    stuckR,
    badChR,
  ] = await db.batch([
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM events WHERE season = ? AND substr(date_start, 1, 10) <= ? AND substr(date_end, 1, 10) >= ?
         AND kind NOT IN ('Kickoff','Workshop','DemoExhibition','VolunteerSignup','PracticeDay')`,
      )
      .bind(CURRENT_SEASON, today, today),
    db.prepare(
      "SELECT MAX(started_at) AS t FROM sync_runs WHERE job = 'eventMatches' AND target NOT LIKE '~%' AND error IS NULL",
    ),
    db
      .prepare(
        `SELECT COUNT(*) AS jobs, SUM(requests) AS req, SUM(not_modified) AS nm, SUM(error IS NOT NULL) AS errs
         FROM sync_runs WHERE started_at > ? AND job IN ('events','teams','eventMatches','awards','leagues','leagueMembers')`,
      )
      .bind(since1),
    db.prepare(
      `SELECT started_at, job, target, substr(error, 1, 200) AS error FROM sync_runs
       WHERE error IS NOT NULL AND job IN ('events','teams','eventMatches','awards','leagues','leagueMembers')
       ORDER BY id DESC LIMIT 1`,
    ),
    db
      .prepare(
        "SELECT MAX(started_at) AS t FROM sync_runs WHERE started_at > ? AND job = 'teams' AND target NOT LIKE '~%'",
      )
      .bind(since3d),
    db.prepare("SELECT year, backfill_stage, backfilled_at FROM seasons ORDER BY year DESC"),
    db
      .prepare(
        "SELECT (SELECT last_checked_at FROM sync_state WHERE key = ?) AS checked, (SELECT COUNT(*) FROM team_avatars) AS n",
      )
      .bind(`avatars/${cmpYear}.css`),
    db.prepare("SELECT * FROM api_usage WHERE day = ?").bind(day),
    db.prepare("SELECT * FROM api_usage WHERE day >= date(?, '-6 days') ORDER BY day DESC, api").bind(day),
    db
      .prepare(
        "SELECT job, MAX(started_at) AS t FROM sync_runs WHERE started_at > ? AND job IN ('videoScan','streamAlign','avatars') GROUP BY job",
      )
      .bind(since7d),
    db.prepare(
      "SELECT started_at, rows_written, substr(error,1,200) AS error FROM sync_runs WHERE job = 'videoScan' ORDER BY id DESC LIMIT 1",
    ),
    db.prepare(
      "SELECT started_at, rows_written, substr(error,1,200) AS error FROM sync_runs WHERE job = 'streamAlign' ORDER BY id DESC LIMIT 1",
    ),
    db.prepare(
      `SELECT COUNT(*) AS attempted, SUM(last_changed_at IS NOT NULL) AS ok,
              (SELECT COUNT(*) FROM videos WHERE source = 'auto_align') AS matches
       FROM sync_state WHERE key LIKE 'stream/%'`,
    ),
    db.prepare("SELECT status, COUNT(*) AS n FROM videos GROUP BY status"),
    db.prepare(
      "SELECT COUNT(*) AS n, SUM(trusted) AS trusted, SUM(auto_scan) AS scanning, MAX(last_scanned_at) AS last FROM video_channels",
    ),
    db
      .prepare(
        `SELECT job, COUNT(*) AS runs, SUM(requests) AS req, SUM(not_modified) AS nm, SUM(rows_written) AS rows,
                SUM(error IS NOT NULL) AS errs, MAX(started_at) AS last, ROUND(AVG(ms)) AS avg_ms
         FROM sync_runs WHERE started_at > ? GROUP BY job ORDER BY runs DESC`,
      )
      .bind(since24),
    db
      .prepare(
        // Aggregate first, then join the 20 targets on events' primary key. Joining every run on
        // `season || '/' || code` can't use an index and took ~1 min on two weeks of runs.
        `WITH u AS (
           SELECT target, MAX(started_at) AS t, SUM(rows_written) AS rows FROM sync_runs
           WHERE started_at > ? AND job = 'eventMatches' AND target NOT LIKE '~%' AND rows_written > 0
           GROUP BY target ORDER BY t DESC LIMIT 20)
         SELECT u.target, u.t, u.rows, e.name FROM u
         LEFT JOIN events e ON e.season = CAST(substr(u.target, 1, 4) AS INTEGER) AND e.code = substr(u.target, 6)
         ORDER BY u.t DESC`,
      )
      .bind(since24),
    db.prepare(
      `SELECT v.id, v.video_id, v.start_s, v.source, v.status, v.title, v.channel_title, v.created_at,
              m.season, m.event_code, m.level, m.series, m.match_number
       FROM videos v JOIN matches m ON m.id = v.match_id ORDER BY v.id DESC LIMIT 15`,
    ),
    db
      .prepare(
        `SELECT started_at, job, target, substr(error, 1, 160) AS error FROM sync_runs
         WHERE error IS NOT NULL AND started_at > ? ORDER BY id DESC LIMIT 12`,
      )
      .bind(since24),
    // Every sync_runs query here is bounded by started_at (the only index): the table holds two weeks
    // of runs, and a slow admin query holds up D1 for the public pages too.
    db
      .prepare(
        `SELECT MAX(started_at) AS t FROM sync_runs
         WHERE started_at > ? AND job IN ${FTC_JOBS} AND requests > 0 AND error IS NULL`,
      )
      .bind(since24),
    db
      .prepare(
        `SELECT started_at, job, target, substr(error, 1, 200) AS error FROM sync_runs
         WHERE started_at > ? AND job IN ${FTC_JOBS} AND (error LIKE 'FTC API 401 %' OR error LIKE 'FTC API 403 %')
         ORDER BY started_at DESC LIMIT 1`,
      )
      .bind(since24),
    // Targets whose every run since their last success (in the last day) failed. One pass over the
    // day's rows: a per-row correlated "last success" lookup scanned the whole table for each error.
    db
      .prepare(
        `WITH r AS (SELECT job, COALESCE(target, '') AS target, started_at, error FROM sync_runs WHERE started_at > ?1),
              ok AS (SELECT job, target, MAX(started_at) AS t FROM r WHERE error IS NULL GROUP BY job, target)
         SELECT r.job, NULLIF(r.target, '') AS target, COUNT(*) AS fails, MAX(r.started_at) AS last,
                substr(MAX(r.error), 1, 160) AS error
         FROM r LEFT JOIN ok ON ok.job = r.job AND ok.target = r.target
         WHERE r.error IS NOT NULL AND r.started_at > COALESCE(ok.t, '')
         GROUP BY r.job, r.target HAVING COUNT(*) >= 3 ORDER BY last DESC LIMIT 10`,
      )
      .bind(since24),
    db.prepare(
      `SELECT channel_id, title, last_error, last_error_at FROM video_channels
       WHERE last_error IS NOT NULL AND (last_scanned_at IS NULL OR last_error_at > last_scanned_at)
       ORDER BY last_error_at DESC LIMIT 10`,
    ),
  ]);

  const one = <T,>(r: D1Result | undefined) => (r?.results?.[0] ?? {}) as T;
  const rows = <T,>(r: D1Result | undefined) => (r?.results ?? []) as T[];

  const liveEvents = one<{ n: number }>(liveR).n ?? 0;
  const lastLive = one<{ t: string | null }>(lastLiveR).t;
  const ftc = one<{ jobs: number; req: number | null; nm: number | null; errs: number | null }>(ftcHourR);
  const lastErr = one<{ started_at?: string; job?: string; target?: string; error?: string }>(lastErrR);
  const lastDaily = one<{ t: string | null }>(dailyR).t;
  const seasons = rows<{ year: number; backfill_stage: string | null; backfilled_at: string | null }>(
    seasonsR,
  );
  const av = one<{ checked: string | null; n: number }>(avatarsR);
  const usage = rows<{
    api: string;
    units: number;
    calls: number;
    errors: number;
    last_error: string | null;
    last_error_at: string | null;
    last_ok_at: string | null;
  }>(usageR);
  const yt = usage.find((u) => u.api === "youtube");
  const rss = usage.find((u) => u.api === "youtube_rss");
  const usage7 = rows<{ day: string; api: string; units: number; calls: number; errors: number }>(usage7R);
  const jobLast = Object.fromEntries(rows<{ job: string; t: string }>(jobR).map((r) => [r.job, r.t]));
  const scan = one<{ started_at?: string; rows_written?: number; error?: string | null }>(scanR);
  const align = one<{ started_at?: string; rows_written?: number; error?: string | null }>(alignR);
  const alignState = one<{ attempted: number; ok: number | null; matches: number }>(alignStateR);
  const queue = Object.fromEntries(rows<{ status: string; n: number }>(queueR).map((r) => [r.status, r.n]));
  const ch = one<{ n: number; trusted: number | null; scanning: number | null; last: string | null }>(
    channelsR,
  );
  const activity = rows<{
    job: string;
    runs: number;
    req: number;
    nm: number;
    rows: number;
    errs: number;
    last: string;
    avg_ms: number;
  }>(activityR);
  const updated = rows<{ target: string; t: string; rows: number; name: string | null }>(updatedR);
  const vids = rows<{
    id: number;
    video_id: string;
    start_s: number | null;
    source: string;
    status: string;
    title: string | null;
    channel_title: string | null;
    created_at: string;
    season: number;
    event_code: string;
    level: string;
    series: number;
    match_number: number;
  }>(videosR);
  const errors = rows<{ started_at: string; job: string; target: string | null; error: string }>(errorsR);
  const ftcOk = one<{ t: string | null }>(ftcOkR).t;
  const ftcAuth = one<{ started_at?: string; job?: string; target?: string; error?: string }>(ftcAuthR);
  const stuck = rows<{ job: string; target: string | null; fails: number; last: string; error: string }>(
    stuckR,
  );
  const badChannels = rows<{
    channel_id: string;
    title: string | null;
    last_error: string;
    last_error_at: string;
  }>(badChR);
  // Staging has no cron (its data is a copy of production), so schedule-driven checks don't apply.
  const staging = c.env.ENV_NAME === "staging";
  const sched = (st: Status): Status => (staging ? "info" : st);

  // Database size: D1 allows these pragmas; fall back silently if not.
  let dbBytes: number | null = null;
  try {
    const [pc, ps] = await db.batch([db.prepare("PRAGMA page_count"), db.prepare("PRAGMA page_size")]);
    const count = Number(Object.values(pc?.results?.[0] ?? {})[0]);
    const size = Number(Object.values(ps?.results?.[0] ?? {})[0]);
    if (count && size) dbBytes = count * size;
  } catch {
    /* not available */
  }

  const liveAge = lastLive ? Date.now() - Date.parse(lastLive) : Number.POSITIVE_INFINITY;
  const liveStatus = sched(
    liveEvents === 0 ? "info" : liveAge < 10 * MIN ? "ok" : liveAge < 30 * MIN ? "warn" : "fail",
  );
  const ftcErrRate = ftc.jobs ? (ftc.errs ?? 0) / ftc.jobs : 0;
  const ftcStatus = sched(!ftc.jobs ? "warn" : ftcErrRate > 0.2 ? "fail" : ftcErrRate > 0.02 ? "warn" : "ok");
  const dailyStatus = sched(lastDaily && Date.now() - Date.parse(lastDaily) < 26 * HOUR ? "ok" : "warn");
  const pendingSeasons = seasons.filter((s) => !s.backfilled_at);
  const avStatus = sched(av.checked && Date.now() - Date.parse(av.checked) < 7 * HOUR ? "ok" : "warn");
  const units = yt?.units ?? 0;
  const ytStatus: Status = staging
    ? "info"
    : !c.env.YOUTUBE_API_KEY
      ? "fail"
      : units > YT_QUOTA * 0.9
        ? "fail"
        : (yt?.errors ?? 0) > 0 && (!yt?.last_ok_at || (yt.last_error_at ?? "") > yt.last_ok_at)
          ? "warn"
          : units > YT_QUOTA * 0.6
            ? "warn"
            : "ok";
  const scanStatus = sched(
    scan.error
      ? "fail"
      : badChannels.length
        ? "warn"
        : scan.started_at && Date.now() - Date.parse(scan.started_at) < 7 * HOUR
          ? "ok"
          : "warn",
  );
  const alignStatus = sched(
    align.error
      ? "fail"
      : align.started_at && Date.now() - Date.parse(align.started_at) < HOUR
        ? "ok"
        : "warn",
  );
  const pct = Math.min(100, (units / YT_QUOTA) * 100);
  // Rejected credentials: the newest 401/403 is more recent than the last FTC request that worked.
  const authFailing = !!ftcAuth.started_at && (!ftcOk || ftcAuth.started_at > ftcOk);
  const credStatus: Status = authFailing ? "fail" : ftcOk ? "ok" : "warn";
  const stuckStatus: Status = stuck.some((x) => x.fails >= ATTEMPTS) ? "fail" : stuck.length ? "warn" : "ok";

  return (
    <Layout title="Admin overview">
      <h1>Admin</h1>
      <AdminNav active="overview" env={c.env.ENV_NAME} />

      <h2>Health</h2>
      {staging && (
        <p class="note">
          Staging has no cron: its data is a copy of production from the last refresh, and events only sync
          when re-synced. Checks that depend on scheduled jobs show — here.
        </p>
      )}
      <Table>
        <thead>
          <tr>
            <th class="l">Check</th>
            <th class="l">Status</th>
            <th class="l">Detail</th>
          </tr>
        </thead>
        <tbody>
          <Check name="Live match polling" s={liveStatus}>
            {liveEvents} {seasonLabel(CURRENT_SEASON)} event{liveEvents === 1 ? "" : "s"} live today · last
            live sync {ago(lastLive)}
          </Check>
          <Check name="FTC Events API" s={ftcStatus}>
            Last hour: {fmt(ftc.jobs)} jobs, {fmt(ftc.req)} requests (
            {ftc.req ? Math.round(((ftc.nm ?? 0) / ftc.req) * 100) : 0}% not modified), {fmt(ftc.errs)} errors
            {lastErr.error && (
              <div class="note">
                Last error {ago(lastErr.started_at)} on {lastErr.job} {lastErr.target}: {lastErr.error}
              </div>
            )}
          </Check>
          <Check name="FTC API credentials" s={credStatus}>
            {authFailing ? (
              <>
                <b>Rejected</b> ({ftcAuth.error}) {ago(ftcAuth.started_at)} on {ftcAuth.job} {ftcAuth.target}.
                Re-set <code>FTC_API_USER</code> / <code>FTC_API_TOKEN</code> on this environment's sync
                Worker
                {c.env.ENV_NAME === "staging" ? " (wrangler secret put … --env staging)" : ""}.
              </>
            ) : ftcOk ? (
              <>Last accepted request {ago(ftcOk)}</>
            ) : (
              <>No accepted FTC API request in the last 24 hours</>
            )}
          </Check>
          <Check name="Repeated failures" s={stuckStatus}>
            {stuck.length === 0
              ? "No job has failed 3+ times in a row in the last 24 hours"
              : stuck.map((x) => (
                  <div>
                    <a
                      href={`/admin/runs?job=${x.job}${x.target ? `&target=${encodeURIComponent(x.target)}` : ""}`}
                    >
                      {x.job} {x.target}
                    </a>{" "}
                    failed {x.fails}× (last {ago(x.last)})
                    {x.fails >= ATTEMPTS && <b> · retries used up, likely in the dead-letter queue</b>}
                    <div class="note">{x.error}</div>
                  </div>
                ))}
          </Check>
          <Check name="Daily resync" s={dailyStatus}>
            Teams + recent events, 09:30 UTC · last ran {ago(lastDaily)}
          </Check>
          <Check name="Season backfill" s={pendingSeasons.length ? "warn" : "ok"}>
            {seasons.length - pendingSeasons.length}/{seasons.length} seasons loaded
            {pendingSeasons.map((s) => (
              <span class="pill">
                {s.year}: {s.backfill_stage ?? "queued"}
              </span>
            ))}
          </Check>
          <Check name="Team avatars" s={avStatus}>
            {fmt(av.n)} avatars ({cmpYear} set) · last checked {ago(av.checked)}
          </Check>
          <Check name="YouTube Data API" s={ytStatus}>
            {!c.env.YOUTUBE_API_KEY && <b>YOUTUBE_API_KEY not set on ftcref-web. </b>}
            <div class="meter" title={`${units} of ${YT_QUOTA} units`}>
              <span style={`width:${pct.toFixed(1)}%`} />
            </div>
            {fmt(units)} / {fmt(YT_QUOTA)} units today (resets midnight Pacific) · {fmt(yt?.errors)} errors ·
            last OK {ago(yt?.last_ok_at)}
            {yt?.last_error && (
              <div class="note">
                Last error {ago(yt.last_error_at)}: {yt.last_error}
              </div>
            )}
            <form method="post" action="/admin/test/youtube" style="display:inline;margin-left:8px">
              <button type="submit" class="go">
                Test now (1 unit)
              </button>
            </form>
          </Check>
          <Check name="YouTube RSS feeds" s={(rss?.errors ?? 0) > 0 ? "warn" : "ok"}>
            {fmt(rss?.calls)} feed reads today (free) · {fmt(rss?.errors)} errors
          </Check>
          <Check name="Channel scans" s={scanStatus}>
            {fmt(ch.n)} channels ({fmt(ch.trusted)} trusted, {fmt(ch.scanning)} auto-scan) · last scan{" "}
            {ago(scan.started_at)}
            {scan.error ? (
              <div class="note">Error: {scan.error}</div>
            ) : (
              ` · ${fmt(scan.rows_written)} videos matched`
            )}
            {badChannels.map((b) => (
              <div class="note">
                Feed failing for <a href={`/admin/channels/${b.channel_id}`}>{b.title ?? b.channel_id}</a> (
                {b.last_error}, {ago(b.last_error_at)}). Fix its channel ID or remove it; other channels still
                scan.
              </div>
            ))}
          </Check>
          <Check name="Livestream timing" s={alignStatus}>
            {fmt(alignState.matches)} matches timed in livestreams · {fmt(alignState.ok)}/
            {fmt(alignState.attempted)} events had a usable stream · last run {ago(align.started_at)}
            {align.error && <div class="note">Error: {align.error}</div>}
          </Check>
          <Check name="Video review queue" s={(queue.pending ?? 0) > 0 ? "warn" : "ok"}>
            <a href="/admin/videos">{fmt(queue.pending)} pending</a> · {fmt(queue.approved)} approved ·{" "}
            {fmt(queue.rejected)} rejected
          </Check>
          <Check name="Database (D1)" s="info">
            {dbBytes ? `${(dbBytes / 1e6).toFixed(0)} MB of 10,000 MB` : "size unavailable"} · avatars/videos
            last job {ago(jobLast.avatars)} / {ago(jobLast.videoScan)}
          </Check>
        </tbody>
      </Table>

      <h2>Re-sync an event</h2>
      <form method="post" action="/admin/resync" class="filters">
        <label>
          Season
          <select name="season">
            {ALL_SEASONS.map((y) => (
              <option value={y} selected={y === CURRENT_SEASON}>
                {seasonLabel(y)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Event code
          <input name="code" required pattern="[A-Za-z0-9]{2,20}" placeholder="KZASN1" />
        </label>
        <button type="submit" class="go" disabled={!c.env.SYNC_QUEUE}>
          Re-sync (forced)
        </button>
        <span class="note">
          Re-fetches schedule, scores, rankings and awards from the FTC API and reruns OPR
          {c.env.SYNC_QUEUE ? "" : " (no SYNC_QUEUE binding here)"}.
        </span>
      </form>

      <h2>Last 24 hours</h2>
      <Table>
        <thead>
          <tr>
            <th class="l">Job</th>
            <th>Runs</th>
            <th>Requests</th>
            <th title="304 Not Modified">304s</th>
            <th>Rows written</th>
            <th>Errors</th>
            <th title="Average duration">Avg ms</th>
            <th class="l">Last run</th>
          </tr>
        </thead>
        <tbody>
          {activity.map((a) => (
            <tr>
              <td class="l">
                <a href={`/admin/runs?job=${a.job}`}>{a.job}</a>
              </td>
              <td>{fmt(a.runs)}</td>
              <td>{fmt(a.req)}</td>
              <td>{fmt(a.nm)}</td>
              <td>{fmt(a.rows)}</td>
              <td class={a.errs ? "r w" : undefined}>
                {a.errs ? <a href={`/admin/runs?job=${a.job}&errors=1`}>{a.errs}</a> : 0}
              </td>
              <td>{fmt(a.avg_ms)}</td>
              <td class="l note">{ago(a.last)}</td>
            </tr>
          ))}
        </tbody>
      </Table>

      <div class="grid">
        <section class="box">
          <h3>Events updated (live sync, 24h)</h3>
          {updated.length === 0 ? (
            <p class="note">No live event changes in the last 24 hours.</p>
          ) : (
            <Table>
              <tbody>
                {updated.map((u) => {
                  const [s, code] = u.target.split("/");
                  return (
                    <tr>
                      <td class="l wrap">
                        <a href={`/events/${s}/${code}`}>{u.name ?? u.target}</a>
                        <div class="sub">
                          {u.target} · {fmt(u.rows)} rows
                        </div>
                      </td>
                      <td class="l note">{ago(u.t)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </section>
        <section class="box">
          <h3>
            Recently added videos{" "}
            <a class="more" href="/admin/videos?status=approved">
              All »
            </a>
          </h3>
          <Table>
            <tbody>
              {vids.map((v) => (
                <tr>
                  <td class="l wrap">
                    <a
                      href={`/events/${v.season}/${v.event_code}/${matchSlug(v.level, v.series, v.match_number)}#video`}
                    >
                      {v.event_code} {matchLabel(v.level, v.series, v.match_number)}
                    </a>
                    <div class="sub">
                      {v.source === "auto_align" ? "livestream timing" : v.source} ·{" "}
                      {v.channel_title ?? v.video_id}
                    </div>
                  </td>
                  <td class="l">
                    <span class={`pill${v.status === "approved" ? " st-live" : ""}`}>{v.status}</span>
                  </td>
                  <td class="l note">{ago(v.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </section>
        <section class="box">
          <h3>
            Recent errors (24h){" "}
            <a class="more" href="/admin/runs?errors=1">
              Sync log »
            </a>
          </h3>
          {errors.length === 0 ? (
            <p class="note">No errors in the last 24 hours.</p>
          ) : (
            <Table>
              <tbody>
                {errors.map((e) => (
                  <tr>
                    <td class="l wrap">
                      <b>{e.job}</b> {e.target}
                      <div class="sub">{e.error}</div>
                    </td>
                    <td class="l note">{ago(e.started_at)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </section>
        <section class="box">
          <h3>YouTube usage (7 days)</h3>
          <Table>
            <thead>
              <tr>
                <th class="l">Day (Pacific)</th>
                <th class="l">API</th>
                <th>Units</th>
                <th>Errors</th>
              </tr>
            </thead>
            <tbody>
              {usage7.map((u) => (
                <tr>
                  <td class="l">{u.day}</td>
                  <td class="l">{u.api === "youtube" ? "Data API" : "RSS (free)"}</td>
                  <td>{u.api === "youtube" ? fmt(u.units) : `${fmt(u.calls)} reads`}</td>
                  <td>{fmt(u.errors)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </section>
      </div>
    </Layout>
  );
}

adminRoutes.post("/admin/test/youtube", async (c) => {
  if (!(await isAdmin(c))) return c.redirect("/admin");
  const t0 = Date.now();
  let result: { ok: boolean; detail: string };
  if (!c.env.YOUTUBE_API_KEY) result = { ok: false, detail: "YOUTUBE_API_KEY is not set on ftcref-web." };
  else {
    try {
      const title = await ytFor(c).channelTitle("UCH0bRF8xOOJxtD6JOYX7TSQ");
      result = {
        ok: !!title,
        detail: title ? `channels.list OK — read “${title}”` : "API answered but returned no channel",
      };
    } catch (e) {
      result = { ok: false, detail: (e as Error).message };
    }
  }
  return c.html(
    <Layout title="YouTube API test">
      <h1>YouTube API test</h1>
      <AdminNav active="overview" env={c.env.ENV_NAME} />
      <p>
        <Dot s={result.ok ? "ok" : "fail"} /> {result.detail}{" "}
        <span class="note">({Date.now() - t0} ms, 1 unit)</span>
      </p>
      {!result.ok && (
        <p class="note">
          403 = the YouTube Data API v3 isn't enabled for the key's Google Cloud project or the key's API
          restriction excludes it; 400 "API key not valid" = wrong key; 403 "quotaExceeded" = daily quota used
          up.
        </p>
      )}
      <p>
        <a href="/admin">Back to overview</a>
      </p>
    </Layout>,
    200,
    noStore,
  );
});

adminRoutes.post("/admin/resync", async (c) => {
  if (!(await isAdmin(c))) return c.redirect("/admin");
  const form = await c.req.parseBody();
  const season = Number(form.season);
  const code = String(form.code ?? "")
    .trim()
    .toUpperCase();
  if (!isSeason(season) || !/^[A-Z0-9]{2,20}$/.test(code) || !c.env.SYNC_QUEUE) {
    return c.text("bad season or event code, or no SYNC_QUEUE binding", 400);
  }
  await c.env.SYNC_QUEUE.sendBatch([
    { body: { job: "eventMatches", season, code, force: true } },
    { body: { job: "awards", season, code, force: true } },
  ]);
  return c.redirect(`/admin/runs?target=${encodeURIComponent(`${season}/${code}`)}&queued=1`);
});

adminRoutes.get("/admin/runs", async (c) => {
  if (!(await isAdmin(c))) return c.redirect("/admin");
  const job = c.req.query("job") ?? "";
  const errorsOnly = c.req.query("errors") === "1";
  const bulk = c.req.query("bulk") ?? "all"; // all | live | backfill
  const target = c.req.query("target") ?? "";
  const queued = c.req.query("queued") === "1";
  const where: string[] = [];
  const args: string[] = [];
  if (target) {
    where.push("target = ?");
    args.push(target);
  }
  if (job) {
    where.push("job = ?");
    args.push(job);
  }
  if (errorsOnly) where.push("error IS NOT NULL");
  if (bulk === "live") where.push("(target IS NULL OR target NOT LIKE '~%')");
  if (bulk === "backfill") where.push("target LIKE '~%'");
  const [runsR, jobsR] = await c.env.DB.batch([
    c.env.DB.prepare(
      `SELECT * FROM sync_runs ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY id DESC LIMIT 200`,
    ).bind(...args),
    c.env.DB.prepare("SELECT DISTINCT job FROM sync_runs WHERE started_at > ? ORDER BY job").bind(
      new Date(Date.now() - 168 * HOUR).toISOString(),
    ),
  ]);
  const runs = (runsR?.results ?? []) as {
    id: number;
    started_at: string;
    job: string;
    target: string | null;
    requests: number;
    not_modified: number;
    rows_written: number;
    ms: number | null;
    error: string | null;
  }[];
  const jobs = ((jobsR?.results ?? []) as { job: string }[]).map((r) => r.job);
  const auto = { onchange: "this.form.submit()" } as Record<string, string>;
  return c.html(
    <Layout title="Sync log">
      <h1>Sync log</h1>
      <AdminNav active="runs" env={c.env.ENV_NAME} />
      {target && (
        <p class="note">
          {queued ? `Queued a forced re-sync of ${target}. ` : ""}Showing runs for <b>{target}</b> only;{" "}
          {queued ? "reload in a few seconds to see the result. " : ""}
          <a href="/admin/runs">show all</a>
        </p>
      )}
      <form class="filters" method="get">
        {target && <input type="hidden" name="target" value={target} />}
        <label>
          Job
          <select name="job" {...auto}>
            <option value="">All jobs</option>
            {jobs.map((j) => (
              <option value={j} selected={j === job}>
                {j}
              </option>
            ))}
          </select>
        </label>
        <label>
          Queue
          <select name="bulk" {...auto}>
            <option value="all" selected={bulk === "all"}>
              All
            </option>
            <option value="live" selected={bulk === "live"}>
              Live / scheduled
            </option>
            <option value="backfill" selected={bulk === "backfill"}>
              Backfill
            </option>
          </select>
        </label>
        <label class="chk">
          <span>
            <input type="checkbox" name="errors" value="1" checked={errorsOnly} {...auto} /> Errors only
          </span>
        </label>
        <button type="submit" class="go">
          Filter
        </button>
      </form>
      <Table>
        <thead>
          <tr>
            <th class="l">When</th>
            <th class="l">Job / target</th>
            <th>Req</th>
            <th>304</th>
            <th>Rows</th>
            <th>ms</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => (
            <tr class={r.error ? "nores" : undefined}>
              <td class="l note" title={r.started_at}>
                {ago(r.started_at)}
              </td>
              <td class="l wrap">
                <b>{r.job}</b> {r.target}
                {r.error && <div class="sub r">{r.error.slice(0, 240)}</div>}
              </td>
              <td>{r.requests}</td>
              <td>{r.not_modified}</td>
              <td>{r.rows_written}</td>
              <td>{r.ms ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Layout>,
    200,
    noStore,
  );
});
