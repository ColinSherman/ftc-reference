import { Hono } from "hono";
import { isAdmin } from "../admin";
import { type Env, matchLabel } from "../env";
import { Layout, Table } from "../views/layout";
import { AdminNav, ago, noStore } from "./admin";

export const channelRoutes = new Hono<{ Bindings: Env }>();

const hms = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h ? `${h}:` : ""}${String(m).padStart(h ? 2 : 1, "0")}:${String(sec).padStart(2, "0")}`;
};
const yt = (v: string, t?: number | null) => `https://www.youtube.com/watch?v=${v}${t ? `&t=${t}s` : ""}`;

type G = {
  video_id: string;
  title: string | null;
  season: number;
  event_code: string;
  event_name: string;
  n: number;
  source: string;
  added: string;
  shift_s: number | null;
};
type Clip = {
  video_id: string;
  start_s: number | null;
  status: string;
  season: number;
  event_code: string;
  level: string;
  series: number;
  match_number: number;
};

/** Everything one YouTube channel has contributed, with per-stream timing adjustment. */
channelRoutes.get("/admin/channels/:id{UC[\\w-]{22}}", async (c) => {
  if (!(await isAdmin(c))) return c.redirect("/admin");
  const id = c.req.param("id");
  const db = c.env.DB;
  const [chR, groupsR, clipsR, unmatchedR] = await db.batch([
    db.prepare("SELECT * FROM video_channels WHERE channel_id = ?").bind(id),
    db
      .prepare(
        `SELECT v.video_id, MIN(v.title) AS title, m.season, m.event_code, e.name AS event_name, COUNT(*) AS n,
                MIN(v.source) AS source, MAX(v.created_at) AS added,
                (SELECT shift_s FROM stream_shifts s WHERE s.video_id = v.video_id) AS shift_s
         FROM videos v JOIN matches m ON m.id = v.match_id
         JOIN events e ON e.season = m.season AND e.code = m.event_code
         WHERE v.channel_id = ? GROUP BY v.video_id, m.season, m.event_code ORDER BY added DESC`,
      )
      .bind(id),
    db
      .prepare(
        `SELECT v.video_id, v.start_s, v.status, m.season, m.event_code, m.level, m.series, m.match_number
         FROM videos v JOIN matches m ON m.id = v.match_id
         WHERE v.channel_id = ? ORDER BY v.video_id, IFNULL(v.start_s, 0), m.level, m.match_number`,
      )
      .bind(id),
    db
      .prepare(
        "SELECT video_id, title, live_start, checked_at FROM channel_streams WHERE channel_id = ? AND event_code IS NULL ORDER BY live_start DESC",
      )
      .bind(id),
  ]);
  const ch = chR?.results?.[0] as
    | {
        title: string | null;
        trusted: number;
        broadcaster: number;
        region_code: string | null;
        last_scanned_at: string | null;
      }
    | undefined;
  const groups = (groupsR?.results ?? []) as G[];
  const clips = (clipsR?.results ?? []) as Clip[];
  const unmatched = (unmatchedR?.results ?? []) as {
    video_id: string;
    title: string | null;
    live_start: string | null;
  }[];
  const clipsOf = (g: G) => clips.filter((x) => x.video_id === g.video_id && x.event_code === g.event_code);
  const streams = groups.filter((g) => g.n > 1 || g.source === "auto_align" || g.source === "anchor");
  const perMatch = groups.filter((g) => !streams.includes(g));

  return c.html(
    <Layout title={`Channel: ${ch?.title ?? id}`}>
      <h1>{ch?.title ?? id}</h1>
      <AdminNav active="videos" env={c.env.ENV_NAME} />
      <p class="sitestats">
        <a href={`https://www.youtube.com/channel/${id}`} rel="noopener">
          YouTube
        </a>{" "}
        · trusted: {ch?.trusted ? "yes" : "no"} · broadcaster:{" "}
        {ch?.broadcaster ? (ch.region_code ?? "any region") : "no"} · last scan {ago(ch?.last_scanned_at)} ·{" "}
        {groups.length} videos · {clips.length} match clips
      </p>

      <h2>Streams &amp; full-event videos</h2>
      <p class="note">
        Shift every clip of a stream at once. Positive = later in the video. The shift is remembered for
        re-syncs.
      </p>
      <Table>
        <thead>
          <tr>
            <th class="l">Video → event</th>
            <th>Clips</th>
            <th>Shift</th>
            <th class="l">Adjust all clips</th>
          </tr>
        </thead>
        <tbody>
          {streams.map((g) => (
            <tr id={`v-${g.video_id}`}>
              <td class="l wrap">
                <a href={yt(g.video_id)} rel="noopener">
                  {g.title ?? g.video_id}
                </a>
                <div class="sub">
                  → <a href={`/events/${g.season}/${g.event_code}#matches`}>{g.event_name}</a> · added{" "}
                  {ago(g.added)}
                </div>
                <details>
                  <summary class="note">{g.n} match timestamps</summary>
                  <div class="clips">
                    {clipsOf(g).map((x) => (
                      <a href={yt(x.video_id, x.start_s)} rel="noopener">
                        {matchLabel(x.level, x.series, x.match_number)}{" "}
                        <span class="note">{hms(x.start_s ?? 0)}</span>
                      </a>
                    ))}
                  </div>
                </details>
              </td>
              <td>{g.n}</td>
              <td>{g.shift_s ? `${g.shift_s > 0 ? "+" : ""}${g.shift_s}s` : "0"}</td>
              <td class="l">
                <form method="post" action={`/admin/streams/${g.video_id}/shift`} class="shift">
                  <input type="hidden" name="back" value={`/admin/channels/${id}#v-${g.video_id}`} />
                  {[-30, -10, -5, -1, 1, 5, 10, 30].map((d) => (
                    <button type="submit" name="delta" value={String(d)} class="go">
                      {d > 0 ? `+${d}` : d}
                    </button>
                  ))}
                  <input name="custom" type="number" step="1" placeholder="±s" style="width:56px" />
                  <button type="submit" name="delta" value="custom" class="go">
                    Apply
                  </button>
                  {g.shift_s ? (
                    <button type="submit" name="delta" value={String(-g.shift_s)} class="go">
                      Reset
                    </button>
                  ) : (
                    ""
                  )}
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </Table>

      <h2>Per-match uploads ({perMatch.length})</h2>
      <div class="clips">
        {perMatch.flatMap(clipsOf).map((x) => (
          <a href={`/events/${x.season}/${x.event_code}#matches`}>
            {x.event_code} {matchLabel(x.level, x.series, x.match_number)}
          </a>
        ))}
      </div>

      <h2>Checked, no event matched ({unmatched.length})</h2>
      <div class="clips">
        {unmatched.map((u) => (
          <a href={yt(u.video_id)} rel="noopener">
            {u.title ?? u.video_id} <span class="note">{u.live_start?.slice(0, 10)}</span>
          </a>
        ))}
      </div>
    </Layout>,
    200,
    noStore,
  );
});

/** Shift every auto-timed/anchored clip of one video; remembered for future re-syncs. */
channelRoutes.post("/admin/streams/:videoId{[\\w-]{11}}/shift", async (c) => {
  if (!(await isAdmin(c))) return c.redirect("/admin");
  const videoId = c.req.param("videoId");
  const f = await c.req.parseBody();
  const delta = Math.trunc(Number(f.delta === "custom" ? f.custom : f.delta));
  const back = String(f.back ?? "");
  const safeBack = back.startsWith("/admin/") ? back : "/admin/videos";
  if (!Number.isFinite(delta) || delta === 0 || Math.abs(delta) > 3600) return c.redirect(safeBack);
  const db = c.env.DB;
  const now = new Date().toISOString();
  const { results: evs } = await db
    .prepare(
      "SELECT DISTINCT m.season, m.event_code FROM videos v JOIN matches m ON m.id = v.match_id WHERE v.video_id = ?",
    )
    .bind(videoId)
    .all<{ season: number; event_code: string }>();
  await db.batch([
    db
      .prepare(
        "UPDATE videos SET start_s = MAX(0, IFNULL(start_s, 0) + ?) WHERE video_id = ? AND source IN ('auto_align', 'anchor')",
      )
      .bind(delta, videoId),
    db
      .prepare(
        `INSERT INTO stream_shifts (video_id, shift_s, updated_at) VALUES (?1, ?2, ?3)
         ON CONFLICT (video_id) DO UPDATE SET shift_s = shift_s + ?2, updated_at = ?3`,
      )
      .bind(videoId, delta, now),
  ]);
  for (const e of evs)
    await c.env.CACHE_VER.put(`event:${e.season}:${e.event_code}`, Date.now().toString(36));
  return c.redirect(safeBack);
});
