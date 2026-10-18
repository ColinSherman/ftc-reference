import { getSeason, isSeason, parseScoutForm } from "@ftcref/seasons";
import type { AppContext } from "../env";
import { parseMatchSlug } from "../env";
import { Layout } from "../views/layout";

const noStore = { "Cache-Control": "no-store" };

function fail(c: AppContext, title: string, back: string) {
  return c.html(
    <Layout title={title}>
      <h1>{title}</h1>
      <p>
        <a href={back}>Back to the match</a>
      </p>
    </Layout>,
    400,
    noStore,
  );
}

const field = (body: Record<string, string | File | (string | File)[]>, key: string) => {
  const v = body[key];
  if (typeof v === "string") return v;
  if (Array.isArray(v)) {
    const first = v.find((x) => typeof x === "string");
    return typeof first === "string" ? first : "";
  }
  return "";
};

const scoutToken = (cookie: string | undefined) => {
  const m = /(?:^|;)\s*scout=([0-9a-f]{32})(?:;|$)/.exec(cookie ?? "");
  return m?.[1] ?? null;
};

const mintToken = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
};

/** Save one robot's card and send the scout back to the box score. */
export async function submitScout(c: AppContext) {
  const season = Number(c.req.param("season"));
  if (!isSeason(season)) return c.notFound();
  const box = getSeason(season).box;
  if (!box) return c.notFound();
  const code = (c.req.param("code") ?? "").toUpperCase();
  const slug = c.req.param("slug") ?? "";
  const back = `/events/${season}/${code}/${slug}#box`;
  const key = parseMatchSlug(slug);
  if (!key) return fail(c, "That match link doesn't look right.", `/events/${season}/${code}`);

  const match = await c.env.DB.prepare(
    `SELECT id FROM matches
     WHERE season = ? AND event_code = ? AND level = ? AND series = ? AND match_number = ?`,
  )
    .bind(season, code, key.level, key.series, key.n)
    .first<{ id: number }>();
  if (!match)
    return c.html(
      <Layout title="Match not found">
        <h1>Match not found</h1>
      </Layout>,
      404,
      noStore,
    );

  const roster = await c.env.DB.prepare("SELECT team FROM match_teams WHERE match_id = ?")
    .bind(match.id)
    .all<{ team: number }>();
  const teams = (roster.results ?? []).map((r) => r.team);

  const body = await c.req.parseBody({ all: true });
  const fields: Record<string, string> = {};
  for (const k of new Set([...Object.keys(body), "team", "mode", "by", "note", "log"]))
    fields[k] = field(body, k);
  const trackedRaw = body.track;
  const tracked = (Array.isArray(trackedRaw) ? trackedRaw : trackedRaw != null ? [trackedRaw] : []).filter(
    (v): v is string => typeof v === "string",
  );

  const parsed = parseScoutForm(box, teams, fields, tracked);
  if (!parsed.ok) return fail(c, parsed.error, back);

  let token = scoutToken(c.req.header("Cookie"));
  const fresh = !token;
  token ??= mintToken();
  const now = new Date().toISOString();
  const card = parsed.value;
  await c.env.DB.prepare(
    `INSERT INTO scout_reports
       (match_id, season, team, token, by_name, mode, line_json, qual_json, log_json, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'live', ?, ?)
     ON CONFLICT (match_id, team, token) DO UPDATE SET
       by_name = excluded.by_name,
       mode = excluded.mode,
       line_json = excluded.line_json,
       qual_json = excluded.qual_json,
       log_json = excluded.log_json,
       status = 'live',
       updated_at = excluded.updated_at`,
  )
    .bind(
      match.id,
      season,
      card.team,
      token,
      card.by,
      card.mode,
      JSON.stringify(card.line),
      JSON.stringify(card.qual),
      card.log.length ? JSON.stringify(card.log) : null,
      now,
      now,
    )
    .run();

  await c.env.CACHE_VER.put(`event:${season}:${code}`, Date.now().toString(36));
  if (fresh) {
    const secure = new URL(c.req.url).protocol === "https:" ? "; Secure" : "";
    c.header("Set-Cookie", `scout=${token}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax${secure}`);
  }
  return c.redirect(back, 303);
}
