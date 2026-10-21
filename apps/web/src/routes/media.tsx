import { isSeason } from "@ftcref/seasons";
import { Hono } from "hono";
import { isAdmin } from "../admin";
import type { Env } from "../env";
import { imgurUrl, instagramUrl, parseMedia } from "../media";
import { Layout, Table } from "../views/layout";
import { AdminNav } from "./admin";

export const mediaRoutes = new Hono<{ Bindings: Env }>();

const noStore = { "Cache-Control": "no-store" };

function Msg(props: { title: string; back: string }) {
  return (
    <Layout title={props.title}>
      <h1>{props.title}</h1>
      <p>
        <a href={props.back}>Back</a>
      </p>
    </Layout>
  );
}

/** Public: submit an Imgur robot photo for a team; it shows after admin approval. */
mediaRoutes.post("/teams/:n{[0-9]+}/photos", async (c) => {
  const n = Number(c.req.param("n"));
  const back = `/teams/${n}`;
  const f = await c.req.parseBody();
  const media = parseMedia(String(f.url ?? ""));
  const season = Number(f.season);
  if (!media)
    return c.html(
      <Msg title="Use a link to one Imgur image (not an album) or an Instagram post" back={back} />,
      400,
      noStore,
    );
  if (!isSeason(season)) return c.html(<Msg title="Pick a season" back={back} />, 400, noStore);
  const team = await c.env.DB.prepare("SELECT 1 FROM teams WHERE number = ?").bind(n).first();
  if (!team) return c.html(<Msg title="Team not found" back="/" />, 404, noStore);
  await c.env.DB.prepare(
    `INSERT INTO team_media (team, season, kind, ref, caption, submitted_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (team, kind, ref) DO NOTHING`,
  )
    .bind(
      n,
      season,
      media.kind,
      media.ref,
      String(f.caption ?? "")
        .trim()
        .slice(0, 120) || null,
      String(f.by ?? "")
        .trim()
        .slice(0, 60) || null,
      new Date().toISOString(),
    )
    .run();
  return c.html(<Msg title="Thanks — photo submitted for review" back={back} />, 200, noStore);
});

mediaRoutes.get("/admin/photos", async (c) => {
  if (!(await isAdmin(c))) return c.redirect("/admin");
  const status = c.req.query("status") ?? "pending";
  const { results } = await c.env.DB.prepare(
    `SELECT m.id, m.team, m.season, m.kind, m.ref, m.caption, m.submitted_by, m.preferred, t.name_short
     FROM team_media m LEFT JOIN teams t ON t.number = m.team
     WHERE m.status = ? ORDER BY m.created_at DESC LIMIT 200`,
  )
    .bind(status)
    .all<{
      id: number;
      team: number;
      season: number;
      kind: string;
      ref: string;
      caption: string | null;
      submitted_by: string | null;
      preferred: number;
      name_short: string | null;
    }>();
  return c.html(
    <Layout title="Admin · Photos">
      <h1>Robot photos</h1>
      <AdminNav active="photos" env={c.env.ENV_NAME} />
      <div class="tabs">
        {["pending", "approved", "rejected"].map((s) =>
          s === status ? <b>{s}</b> : <a href={`?status=${s}`}>{s}</a>,
        )}
      </div>
      <form method="post" action="/admin/photos" class="filters">
        <input name="team" type="number" placeholder="Team #" required style="width:90px" />
        <input name="season" type="number" placeholder="Season" required style="width:90px" />
        <input name="url" placeholder="Imgur or Instagram link" required />
        <input name="caption" placeholder="Caption (optional)" />
        <button type="submit" class="go">
          Add (approved)
        </button>
      </form>
      <Table>
        <thead>
          <tr>
            <th class="l">Photo</th>
            <th class="l">Team</th>
            <th>Season</th>
            <th class="l">Caption / by</th>
            <th class="l" />
          </tr>
        </thead>
        <tbody>
          {results.map((r) => (
            <tr>
              <td class="l">
                {r.kind === "instagram" ? (
                  <a href={instagramUrl(r.ref)}>Instagram post</a>
                ) : (
                  <a href={imgurUrl(r.ref)}>
                    <img src={imgurUrl(r.ref, "t")} width={120} alt="" loading="lazy" />
                  </a>
                )}
              </td>
              <td class="l">
                <a href={`/teams/${r.team}?season=${r.season}`}>
                  {r.team} {r.name_short}
                </a>
              </td>
              <td>{r.season}</td>
              <td class="l wrap">
                {r.caption}
                <div class="sub">{r.submitted_by}</div>
              </td>
              <td class="l">
                <form method="post" action={`/admin/photos/${r.id}`} style="display:flex;gap:6px">
                  <button type="submit" name="action" value="approve" class="go">
                    Approve
                  </button>
                  <button
                    type="submit"
                    name="action"
                    value="prefer"
                    class="go"
                    title="Approve and show first / in the header"
                  >
                    ★ Main
                  </button>
                  <button type="submit" name="action" value="reject" class="go">
                    Reject
                  </button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Layout>,
    200,
    noStore,
  );
});

mediaRoutes.post("/admin/photos", async (c) => {
  if (!(await isAdmin(c))) return c.redirect("/admin");
  const f = await c.req.parseBody();
  const media = parseMedia(String(f.url ?? ""));
  const team = Number(f.team);
  const season = Number(f.season);
  if (!media || !Number.isInteger(team) || !isSeason(season))
    return c.html(<Msg title="Bad team, season or link" back="/admin/photos" />, 400, noStore);
  const now = new Date().toISOString();
  await c.env.DB.prepare(
    `INSERT INTO team_media (team, season, kind, ref, caption, status, submitted_by, created_at, reviewed_at)
     VALUES (?, ?, ?, ?, ?, 'approved', 'admin', ?, ?)
     ON CONFLICT (team, kind, ref) DO UPDATE SET status = 'approved', reviewed_at = ?`,
  )
    .bind(
      team,
      season,
      media.kind,
      media.ref,
      String(f.caption ?? "")
        .trim()
        .slice(0, 120) || null,
      now,
      now,
      now,
    )
    .run();
  return c.redirect("/admin/photos?status=approved");
});

mediaRoutes.post("/admin/photos/:id{[0-9]+}", async (c) => {
  if (!(await isAdmin(c))) return c.redirect("/admin");
  const f = await c.req.parseBody();
  const id = Number(c.req.param("id"));
  const action = String(f.action);
  const status =
    action === "reject" ? "rejected" : action === "approve" || action === "prefer" ? "approved" : null;
  if (!status) return c.redirect("/admin/photos");
  const now = new Date().toISOString();
  if (action === "prefer") {
    // One preferred photo per team.
    await c.env.DB.prepare(
      "UPDATE team_media SET preferred = 0 WHERE team = (SELECT team FROM team_media WHERE id = ?)",
    )
      .bind(id)
      .run();
  }
  await c.env.DB.prepare("UPDATE team_media SET status = ?, preferred = ?, reviewed_at = ? WHERE id = ?")
    .bind(status, action === "prefer" ? 1 : 0, now, id)
    .run();
  return c.redirect(c.req.header("Referer") ?? "/admin/photos");
});
