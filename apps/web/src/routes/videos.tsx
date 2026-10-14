import { seasonLabel } from "@ftcref/seasons";
import {
  anchorAlign,
  type ImportResult,
  importVideos,
  parseYoutubeSource,
  parseYoutubeUrl,
  submitMatchVideo,
  timeToSeconds,
  YouTube,
  type YtVideo,
} from "@ftcref/videos";
import { Hono } from "hono";
import { isAdmin, logIn, logOut } from "../admin";
import { type AppContext, type Env, matchLabel, matchSlug, parseMatchSlug } from "../env";
import { Layout, Table } from "../views/layout";

export const videoRoutes = new Hono<{ Bindings: Env }>();

const noStore = { "Cache-Control": "no-store" };
const bump = (c: AppContext, season: number | string, code: string) =>
  c.env.CACHE_VER.put(`event:${season}:${code}`, Date.now().toString(36));

// ----------------------------------------------------------------------------- public submission

videoRoutes.get("/videos/submit", async (c) => {
  const match = c.req.query("match"); // "2025/USCALACALAM1/q3"
  let target: { season: number; code: string; label: string; name: string } | null = null;
  if (match) {
    const [s, code, slug] = match.split("/");
    const key = slug ? parseMatchSlug(slug) : null;
    if (s && code && key) {
      const ev = await c.env.DB.prepare("SELECT name FROM events WHERE season = ? AND code = ?")
        .bind(Number(s), code.toUpperCase())
        .first<{ name: string }>();
      if (ev)
        target = {
          season: Number(s),
          code: code.toUpperCase(),
          label: matchLabel(key.level, key.series, key.n),
          name: ev.name,
        };
    }
  }
  return c.html(
    <Layout title="Submit match videos">
      <h1>Submit match videos</h1>
      {target ? (
        <>
          <p>
            Adding a video for <b>{target.label}</b> at{" "}
            <a href={`/events/${target.season}/${target.code}`}>{target.name}</a> (
            {seasonLabel(target.season)}).
          </p>
          <form
            method="post"
            action="/videos/submit"
            class="filters"
            style="flex-direction:column;align-items:stretch;max-width:560px"
          >
            <input type="hidden" name="match" value={match} />
            <label>
              YouTube link (add <code>?t=</code> or <code>&amp;t=1h2m3s</code> to start mid-stream)
              <input
                name="url"
                required
                placeholder="https://youtu.be/… or a livestream link with ?t="
                style="width:100%"
              />
            </label>
            <label>
              Your name or team (optional)
              <input name="by" maxlength={60} style="width:100%" />
            </label>
            <button type="submit" class="go">
              Submit for review
            </button>
          </form>
        </>
      ) : (
        <>
          <p>
            Paste a <b>playlist</b>, <b>channel</b> or <b>single video</b> link. We read the titles and match
            them to FTC matches automatically — titles like <i>“SoCal FTC Group H – Scrimmage 2 – Q12”</i>,{" "}
            <i>“Qualification Match 12”</i>, <i>“Playoff 3”</i> or <i>“SF1-2”</i> all work. A playlist named
            after the event (one playlist per event) gives the best results.
          </p>
          <form
            method="post"
            action="/videos/submit"
            class="filters"
            style="flex-direction:column;align-items:stretch;max-width:640px"
          >
            <label>
              YouTube playlist, channel or video link
              <input
                name="source"
                required
                placeholder="https://www.youtube.com/playlist?list=… or https://www.youtube.com/@yourteam"
                style="width:100%"
              />
            </label>
            <label>
              Event (optional, e.g. <code>2025/USCALACALAM2</code>) — forces every video to this event
              <input name="event" pattern="\d{4}/[A-Za-z0-9]+" style="width:100%" />
            </label>
            <label>
              Your name or team (optional)
              <input name="by" maxlength={60} style="width:100%" />
            </label>
            <button type="submit" class="go">
              Match videos
            </button>
          </form>
          <p class="note">
            New submissions are reviewed before they appear. Channels we trust (teams and event partners that
            post consistently) go live automatically — ask to have yours added.
          </p>

          <h2>Full-event video (one uncut VOD)</h2>
          <p>
            Have the whole event in one video? Tell us when <b>one</b> match starts and we time every other
            match from FIRST's recorded match start times. Livestream recordings listed on the FIRST event
            page are timed automatically — use this for re-uploads, local recordings, or to correct a stream
            that's off.
          </p>
          <form
            method="post"
            action="/videos/submit"
            class="filters"
            style="flex-direction:column;align-items:stretch;max-width:640px"
          >
            <input type="hidden" name="mode" value="anchor" />
            <label>
              YouTube video link
              <input name="url" required placeholder="https://www.youtube.com/watch?v=…" style="width:100%" />
            </label>
            <label>
              Event (season/code, e.g. <code>2025/USCALACALAM2</code>)
              <input name="event" required pattern="\d{4}/[A-Za-z0-9()]+" style="width:100%" />
            </label>
            <div style="display:flex;gap:14px;flex-wrap:wrap">
              <label>
                Match you can see start
                <input name="anchor_match" required placeholder="Q1" style="width:110px" />
              </label>
              <label>
                …starts at (in the video)
                <input name="anchor_time" required placeholder="0:12:34" style="width:130px" />
              </label>
            </div>
            <label>
              Your name or team (optional)
              <input name="by" maxlength={60} style="width:100%" />
            </label>
            <button type="submit" class="go">
              Time all matches
            </button>
          </form>
          <p class="note">
            Tip: “starts” = the moment the match timer begins. Pick an early qualification match; one anchor
            covers the whole day as long as the video is uncut.
          </p>
        </>
      )}
    </Layout>,
    200,
    noStore,
  );
});

videoRoutes.post("/videos/submit", async (c) => {
  const f = await c.req.parseBody();
  const by = String(f.by ?? "").slice(0, 60) || null;

  // Whole-event video timed from one anchor match.
  if (f.mode === "anchor") return anchorSubmit(c, f, by);

  // Single video for one match (from the match page).
  if (f.match) {
    const [s, code, slug] = String(f.match).split("/");
    const key = slug ? parseMatchSlug(slug) : null;
    const yt = parseYoutubeUrl(String(f.url ?? ""));
    if (!s || !code || !key || !yt)
      return c.html(<Msg title="That link didn't look right" back="/videos/submit" />, 400, noStore);
    const m = await c.env.DB.prepare(
      "SELECT id FROM matches WHERE season = ? AND event_code = ? AND level = ? AND series = ? AND match_number = ?",
    )
      .bind(Number(s), code.toUpperCase(), key.level, key.series, key.n)
      .first<{ id: number }>();
    if (!m) return c.html(<Msg title="Match not found" back="/videos/submit" />, 404, noStore);
    await submitMatchVideo(c.env.DB, m.id, yt, by);
    return c.html(
      <Msg
        title="Thanks — submitted for review"
        back={`/events/${s}/${code.toUpperCase()}/${slug}`}
        backLabel="Back to the match"
      />,
      200,
      noStore,
    );
  }

  if (!c.env.YOUTUBE_API_KEY)
    return c.html(<Msg title="Video import isn't configured yet" back="/" />, 503, noStore);
  const yt = new YouTube(c.env.YOUTUBE_API_KEY);
  const raw = String(f.source ?? "");
  const event = String(f.event ?? "").trim() || undefined;
  let videos: YtVideo[] = [];
  let playlistTitle: string | undefined;
  let channelId: string | undefined;
  try {
    const src = parseYoutubeSource(raw);
    const single = parseYoutubeUrl(raw);
    if (src?.kind === "playlist") {
      const meta = await yt.playlistTitle(src.id);
      playlistTitle = meta?.title;
      channelId = meta?.channelId;
      videos = await yt.playlistVideos(src.id);
    } else if (src?.kind === "channel" || src?.kind === "handle") {
      channelId = src.kind === "channel" ? src.id : (await yt.channelByHandle(src.handle))?.id;
      if (channelId) videos = await yt.playlistVideos(YouTube.uploadsPlaylist(channelId));
    } else if (single) {
      const v = await yt.video(single.id);
      if (v) {
        videos = [v];
        channelId = v.channelId;
      }
    }
  } catch (e) {
    return c.html(
      <Msg title={`YouTube error: ${(e as Error).message.slice(0, 120)}`} back="/videos/submit" />,
      502,
      noStore,
    );
  }
  if (videos.length === 0)
    return c.html(<Msg title="No videos found at that link" back="/videos/submit" />, 404, noStore);

  const trusted = channelId
    ? !!(
        await c.env.DB.prepare("SELECT trusted FROM video_channels WHERE channel_id = ?")
          .bind(channelId)
          .first<{ trusted: number }>()
      )?.trusted
    : false;
  const result = await importVideos(c.env.DB, videos, {
    playlistTitle,
    event,
    source: "playlist",
    submittedBy: by,
    trusted,
  });
  for (const t of result.touched) {
    const [season, code] = t.split(":");
    if (season && code) await bump(c, season, code);
  }
  return c.html(
    <Layout title="Video import results">
      <h1>Video import</h1>
      <p class="sitestats">
        {videos.length} videos read{playlistTitle && ` from “${playlistTitle}”`} · <b>{result.approved}</b>{" "}
        live now · <b>{result.pending}</b> waiting for review ·{" "}
        {videos.length - result.approved - result.pending} not matched
        {trusted && " · trusted channel"}
      </p>
      <ImportTable result={result} />
      <p>
        <a href="/videos/submit">Submit more</a>
      </p>
    </Layout>,
    200,
    noStore,
  );
});

function ImportTable(props: { result: ImportResult }) {
  return (
    <Table>
      <thead>
        <tr>
          <th class="l">Video</th>
          <th class="l">Matched to</th>
          <th class="l">Status</th>
          <th class="l">Why</th>
        </tr>
      </thead>
      <tbody>
        {props.result.proposals.map((p) => (
          <tr class={p.status === "skipped" ? "nores" : undefined}>
            <td class="l">
              <a href={`https://www.youtube.com/watch?v=${p.video.videoId}`} rel="noopener">
                {p.video.title}
              </a>
            </td>
            <td class="l">
              {p.event && p.ref ? (
                <a
                  href={`/events/${p.event.season}/${p.event.code}/${matchSlug(p.ref.level, p.ref.series, p.ref.number)}`}
                >
                  {p.event.code} {matchLabel(p.ref.level, p.ref.series, p.ref.number)}
                </a>
              ) : (
                ""
              )}
            </td>
            <td class="l">
              {p.status === "approved" ? (
                <span class="pill st-live">live</span>
              ) : (
                <span class="pill">{p.status}</span>
              )}
            </td>
            <td class="l note">{p.reason}</td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

function Msg(props: { title: string; back: string; backLabel?: string }) {
  return (
    <Layout title={props.title}>
      <h1>{props.title}</h1>
      <p>
        <a href={props.back}>{props.backLabel ?? "Back"}</a>
      </p>
    </Layout>
  );
}

// ----------------------------------------------------------------------------- admin review

videoRoutes.get("/admin", async (c) => {
  if (await isAdmin(c)) return c.redirect("/admin/videos");
  return c.html(
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
    </Layout>,
    200,
    noStore,
  );
});

videoRoutes.post("/admin/login", async (c) => {
  const f = await c.req.parseBody();
  if (await logIn(c, String(f.token ?? ""))) return c.redirect("/admin/videos");
  return c.html(<Msg title="Wrong token" back="/admin" />, 401, noStore);
});

videoRoutes.post("/admin/logout", (c) => {
  logOut(c);
  return c.redirect("/");
});

videoRoutes.get("/admin/videos", async (c) => {
  if (!(await isAdmin(c))) return c.redirect("/admin");
  const status = c.req.query("status") ?? "pending";
  const [rowsR, countsR, chR] = await c.env.DB.batch([
    c.env.DB.prepare(
      `SELECT v.id, v.video_id, v.start_s, v.title, v.channel_title, v.confidence, v.reason, v.submitted_by, v.source,
              m.season, m.event_code, m.level, m.series, m.match_number, e.name AS event_name
       FROM videos v JOIN matches m ON m.id = v.match_id JOIN events e ON e.season = m.season AND e.code = m.event_code
       WHERE v.status = ? ORDER BY m.season DESC, m.event_code, m.level, m.series, m.match_number LIMIT 500`,
    ).bind(status),
    c.env.DB.prepare("SELECT status, COUNT(*) AS n FROM videos GROUP BY status"),
    c.env.DB.prepare("SELECT * FROM video_channels ORDER BY trusted DESC, title"),
  ]);
  type V = {
    id: number;
    video_id: string;
    start_s: number | null;
    title: string | null;
    channel_title: string | null;
    confidence: string | null;
    reason: string | null;
    submitted_by: string | null;
    source: string;
    season: number;
    event_code: string;
    level: string;
    series: number;
    match_number: number;
    event_name: string;
  };
  const rows = (rowsR?.results ?? []) as V[];
  const counts = Object.fromEntries(
    ((countsR?.results ?? []) as { status: string; n: number }[]).map((r) => [r.status, r.n]),
  );
  const channels = (chR?.results ?? []) as {
    channel_id: string;
    title: string | null;
    trusted: number;
    auto_scan: number;
    last_scanned_at: string | null;
  }[];
  return c.html(
    <Layout title="Review videos">
      <h1>Match videos</h1>
      <div class="tabs">
        {["pending", "approved", "rejected"].map((s) =>
          s === status ? (
            <b>
              {s} ({counts[s] ?? 0})
            </b>
          ) : (
            <a href={`?status=${s}`}>
              {s} ({counts[s] ?? 0})
            </a>
          ),
        )}
        <form method="post" action="/admin/logout" style="margin-left:auto">
          <button type="submit" class="go">
            Log out
          </button>
        </form>
      </div>
      {status === "pending" && rows.some((r) => r.confidence === "high") && (
        <form method="post" action="/admin/videos/bulk">
          <input type="hidden" name="action" value="approve-high" />
          <button type="submit" class="go">
            Approve all {rows.filter((r) => r.confidence === "high").length} high-confidence
          </button>
        </form>
      )}
      {rows.length === 0 ? (
        <p class="note">Nothing here.</p>
      ) : (
        <Table>
          <thead>
            <tr>
              <th class="l"> </th>
              <th class="l">Match</th>
              <th class="l">Video</th>
              <th class="l">Conf.</th>
              <th class="l">Why / who</th>
              <th class="l">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((v) => (
              <tr>
                <td class="l">
                  <a
                    href={`https://www.youtube.com/watch?v=${v.video_id}${v.start_s ? `&t=${v.start_s}` : ""}`}
                    rel="noopener"
                  >
                    <img
                      src={`https://i.ytimg.com/vi/${v.video_id}/default.jpg`}
                      width={80}
                      height={60}
                      loading="lazy"
                      alt=""
                    />
                  </a>
                </td>
                <td class="l">
                  <a
                    href={`/events/${v.season}/${v.event_code}/${matchSlug(v.level, v.series, v.match_number)}`}
                  >
                    {v.event_code} {matchLabel(v.level, v.series, v.match_number)}
                  </a>
                  <div class="note">{v.event_name}</div>
                </td>
                <td class="l">
                  {v.title ?? v.video_id}
                  {v.start_s ? <span class="note"> @{v.start_s}s</span> : ""}
                  <div class="note">{v.channel_title}</div>
                </td>
                <td class="l">{v.confidence}</td>
                <td class="l note">
                  {v.reason}
                  {v.submitted_by && <div>by {v.submitted_by}</div>}
                </td>
                <td class="l">
                  <form method="post" action={`/admin/videos/${v.id}`} style="display:flex;gap:4px">
                    {status !== "approved" && (
                      <button type="submit" name="action" value="approve" class="go">
                        Approve
                      </button>
                    )}
                    {status !== "rejected" && (
                      <button type="submit" name="action" value="reject" class="go">
                        Reject
                      </button>
                    )}
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      <h2>Channels</h2>
      <p class="note">
        Trusted: confident matches go live without review. Auto-scan: new uploads are checked every 6 hours.
      </p>
      <Table>
        <thead>
          <tr>
            <th class="l">Channel</th>
            <th>Trusted</th>
            <th>Auto-scan</th>
            <th class="l">Last scan</th>
            <th class="l"> </th>
          </tr>
        </thead>
        <tbody>
          {channels.map((ch) => (
            <tr>
              <td class="l">
                <a href={`https://www.youtube.com/channel/${ch.channel_id}`} rel="noopener">
                  {ch.title ?? ch.channel_id}
                </a>
              </td>
              <td>{ch.trusted ? "✓" : ""}</td>
              <td>{ch.auto_scan ? "✓" : ""}</td>
              <td class="l note">{ch.last_scanned_at?.slice(0, 16).replace("T", " ") ?? "never"}</td>
              <td class="l">
                <form method="post" action="/admin/channels" style="display:flex;gap:4px">
                  <input type="hidden" name="channel_id" value={ch.channel_id} />
                  <button type="submit" name="action" value="toggle-trusted" class="go">
                    {ch.trusted ? "Untrust" : "Trust"}
                  </button>
                  <button type="submit" name="action" value="toggle-scan" class="go">
                    {ch.auto_scan ? "Stop scanning" : "Auto-scan"}
                  </button>
                  <button type="submit" name="action" value="scan-now" class="go">
                    Scan now
                  </button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
      <form method="post" action="/admin/channels" class="filters" style="max-width:640px">
        <input type="hidden" name="action" value="add" />
        <label>
          Add channel (URL or @handle)
          <input name="url" required style="width:320px" />
        </label>
        <label class="chk">
          <span>
            <input type="checkbox" name="trusted" value="1" /> Trusted
          </span>
        </label>
        <label class="chk">
          <span>
            <input type="checkbox" name="auto_scan" value="1" checked /> Auto-scan
          </span>
        </label>
        <button type="submit" class="go">
          Add
        </button>
      </form>
    </Layout>,
    200,
    noStore,
  );
});

videoRoutes.post("/admin/videos/bulk", async (c) => {
  if (!(await isAdmin(c))) return c.redirect("/admin");
  const { results } = await c.env.DB.prepare(
    `SELECT DISTINCT m.season, m.event_code FROM videos v JOIN matches m ON m.id = v.match_id
     WHERE v.status = 'pending' AND v.confidence = 'high'`,
  ).all<{ season: number; event_code: string }>();
  await c.env.DB.prepare(
    "UPDATE videos SET status = 'approved', reviewed_at = ? WHERE status = 'pending' AND confidence = 'high'",
  )
    .bind(new Date().toISOString())
    .run();
  for (const r of results) await bump(c, r.season, r.event_code);
  return c.redirect("/admin/videos");
});

videoRoutes.post("/admin/videos/:id{[0-9]+}", async (c) => {
  if (!(await isAdmin(c))) return c.redirect("/admin");
  const f = await c.req.parseBody();
  const status = f.action === "approve" ? "approved" : f.action === "reject" ? "rejected" : null;
  if (!status) return c.redirect("/admin/videos");
  const id = Number(c.req.param("id"));
  const m = await c.env.DB.prepare(
    "SELECT m.season, m.event_code FROM videos v JOIN matches m ON m.id = v.match_id WHERE v.id = ?",
  )
    .bind(id)
    .first<{ season: number; event_code: string }>();
  await c.env.DB.prepare("UPDATE videos SET status = ?, reviewed_at = ? WHERE id = ?")
    .bind(status, new Date().toISOString(), id)
    .run();
  if (m) await bump(c, m.season, m.event_code);
  return c.redirect(c.req.header("Referer") ?? "/admin/videos");
});

videoRoutes.post("/admin/channels", async (c) => {
  if (!(await isAdmin(c))) return c.redirect("/admin");
  const f = await c.req.parseBody();
  const id = String(f.channel_id ?? "");
  const now = new Date().toISOString();
  if (f.action === "toggle-trusted" || f.action === "toggle-scan") {
    const col = f.action === "toggle-trusted" ? "trusted" : "auto_scan";
    await c.env.DB.prepare(`UPDATE video_channels SET ${col} = 1 - ${col} WHERE channel_id = ?`)
      .bind(id)
      .run();
  } else if (f.action === "scan-now") {
    if (!c.env.YOUTUBE_API_KEY)
      return c.html(
        <Msg title="YOUTUBE_API_KEY is not set on ftcref-web" back="/admin/videos" />,
        503,
        noStore,
      );
    const ch = await c.env.DB.prepare("SELECT trusted, title FROM video_channels WHERE channel_id = ?")
      .bind(id)
      .first<{ trusted: number; title: string | null }>();
    const yt = new YouTube(c.env.YOUTUBE_API_KEY);
    let videos: YtVideo[];
    let r: ImportResult;
    try {
      videos = await yt.playlistVideos(YouTube.uploadsPlaylist(id));
      r = await importVideos(c.env.DB, videos, { source: "scan", trusted: !!ch?.trusted });
    } catch (e) {
      console.error("scan-now failed", e);
      return c.html(
        <Layout title="Scan failed">
          <h1>Scan failed</h1>
          <pre style="white-space:pre-wrap;font-size:12px">{(e as Error).message}</pre>
          <p class="note">
            A YouTube 403 usually means the YouTube Data API v3 isn't enabled for the key's Google Cloud
            project, or the key's API restriction doesn't include it.
          </p>
          <p>
            <a href="/admin/videos">Back</a>
          </p>
        </Layout>,
        502,
        noStore,
      );
    }
    for (const t of r.touched) {
      const [season, code] = t.split(":");
      if (season && code) await bump(c, season, code);
    }
    await c.env.DB.prepare("UPDATE video_channels SET last_scanned_at = ? WHERE channel_id = ?")
      .bind(now, id)
      .run();
    return c.html(
      <Layout title="Scan results">
        <h1>Scanned {ch?.title ?? id}</h1>
        <p class="sitestats">
          {videos.length} uploads read · <b>{r.approved}</b> live now · <b>{r.pending}</b> waiting for review
          · {videos.length - r.approved - r.pending} not matched (or already imported)
        </p>
        <p>
          <a href="/admin/videos">Back to review queue</a>
        </p>
        <ImportTable result={r} />
      </Layout>,
      200,
      noStore,
    );
  } else if (f.action === "add" && c.env.YOUTUBE_API_KEY) {
    const yt = new YouTube(c.env.YOUTUBE_API_KEY);
    const src = parseYoutubeSource(String(f.url ?? "").replace(/^@/, "https://www.youtube.com/@"));
    let chId: string | null = null;
    let title: string | null = null;
    if (src?.kind === "channel") {
      chId = src.id;
      title = await yt.channelTitle(src.id);
    } else if (src?.kind === "handle") {
      const ch = await yt.channelByHandle(src.handle);
      chId = ch?.id ?? null;
      title = ch?.title ?? null;
    }
    if (chId) {
      await c.env.DB.prepare(
        `INSERT INTO video_channels (channel_id, title, trusted, auto_scan, added_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (channel_id) DO UPDATE SET title = excluded.title, trusted = excluded.trusted, auto_scan = excluded.auto_scan`,
      )
        .bind(chId, title, f.trusted ? 1 : 0, f.auto_scan ? 1 : 0, now)
        .run();
    }
  }
  return c.redirect("/admin/videos");
});

/** "1:02:03", "12:34", "754" or "12m34s" → seconds. */
function clockToSeconds(s: string): number | null {
  const t = s.trim();
  if (/^\d+$/.test(t)) return Number(t);
  const hms = /^(?:(\d+):)?(\d{1,2}):(\d{2})$/.exec(t);
  if (hms) return Number(hms[1] ?? 0) * 3600 + Number(hms[2]) * 60 + Number(hms[3]);
  return timeToSeconds(t) ?? null;
}

async function anchorSubmit(c: AppContext, f: Record<string, unknown>, by: string | null) {
  const yt = parseYoutubeUrl(String(f.url ?? ""));
  const [s, rawCode] = String(f.event ?? "").split("/");
  const code = (rawCode ?? "").toUpperCase();
  const key = parseMatchSlug(
    String(f.anchor_match ?? "")
      .trim()
      .toLowerCase()
      .replace(/^qm?/, "q"),
  );
  const anchorS = clockToSeconds(String(f.anchor_time ?? ""));
  if (!yt || !s || !code || !key || anchorS == null) {
    return c.html(
      <Msg
        title="Please check the link, event, match (e.g. Q1) and time (e.g. 0:12:34)"
        back="/videos/submit"
      />,
      400,
      noStore,
    );
  }
  const ev = await c.env.DB.prepare("SELECT name FROM events WHERE season = ? AND code = ?")
    .bind(Number(s), code)
    .first<{ name: string }>();
  if (!ev) return c.html(<Msg title={`Event ${s}/${code} not found`} back="/videos/submit" />, 404, noStore);

  // Video length + channel (1 quota unit) so offsets past the end are dropped and trust can apply.
  let details: Awaited<ReturnType<YouTube["streamDetails"]>>[number] | undefined;
  if (c.env.YOUTUBE_API_KEY) {
    try {
      details = (await new YouTube(c.env.YOUTUBE_API_KEY).streamDetails([yt.id]))[0];
    } catch {
      /* timing still works without it */
    }
  }
  const trusted = details?.channelId
    ? !!(
        await c.env.DB.prepare("SELECT trusted FROM video_channels WHERE channel_id = ?")
          .bind(details.channelId)
          .first<{ trusted: number }>()
      )?.trusted
    : false;
  const approved = trusted || (await isAdmin(c));
  const r = await anchorAlign(c.env.DB, {
    season: Number(s),
    code,
    videoId: yt.id,
    anchor: { level: key.level, series: key.series, number: key.n },
    anchorS,
    durationS: details?.durationS ?? null,
    title: details?.title,
    channelId: details?.channelId,
    channelTitle: details?.channelTitle,
    submittedBy: by,
    approved,
  });
  if (approved && r.placed) await bump(c, s, code);
  return c.html(
    <Layout title="Full-event video timed">
      <h1>{r.placed ? `Timed ${r.placed} matches` : "Couldn't time this video"}</h1>
      <p>
        <a href={`/events/${s}/${code}#matches`}>{ev.name}</a> · {r.placed} matches placed · {r.skipped}{" "}
        outside the video{r.reason && ` · ${r.reason}`}
      </p>
      <p class="sitestats">
        {approved ? "Live now." : "Submitted for review — it will appear once approved."}
      </p>
      <p>
        <a href="/videos/submit">Submit another</a>
      </p>
    </Layout>,
    200,
    noStore,
  );
}
