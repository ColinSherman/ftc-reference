import { nowIso } from "@ftcref/db";
import { FtcApi } from "@ftcref/ftc-api";
import { CURRENT_SEASON } from "@ftcref/seasons";
import type { Env, SyncMessage } from "./env";
import { syncAwards } from "./jobs/awards";
import { syncEventMatches } from "./jobs/eventMatches";
import { syncEvents } from "./jobs/events";
import { syncLeagueMembers, syncLeagues } from "./jobs/leagues";
import { syncTeamsPage } from "./jobs/teams";
import { planLive, recentEvents } from "./planner";

const season = CURRENT_SEASON;

async function enqueue(env: Env, msgs: SyncMessage[]) {
  for (let i = 0; i < msgs.length; i += 100) {
    await env.SYNC_QUEUE.sendBatch(msgs.slice(i, i + 100).map((body) => ({ body })));
  }
}

async function runJob(env: Env, msg: SyncMessage) {
  const api = new FtcApi({ user: env.FTC_API_USER, token: env.FTC_API_TOKEN, baseUrl: env.FTC_API_BASE });
  const started = Date.now();
  const target = "code" in msg ? msg.code : "page" in msg ? String(msg.page) : null;
  let rows = 0;
  let error: string | null = null;
  try {
    switch (msg.job) {
      case "events":
        rows = await syncEvents(env, api, msg.season);
        break;
      case "teams": {
        const r = await syncTeamsPage(env, api, msg.season, msg.page);
        rows = r.written;
        // Page 1 fans out the remaining pages so the queue fetches them in parallel.
        if (msg.page === 1 && r.pageTotal && r.pageTotal > 1) {
          const rest = Array.from({ length: r.pageTotal - 1 }, (_, i) => i + 2);
          await enqueue(
            env,
            rest.map((page) => ({ job: "teams", season: msg.season, page })),
          );
        }
        break;
      }
      case "eventMatches":
        rows = (await syncEventMatches(env, api, msg.season, msg.code, msg.force)).rows;
        break;
      case "awards":
        rows = await syncAwards(env, api, msg.season, msg.code, msg.force);
        break;
      case "leagues": {
        const leagues = await syncLeagues(env, api, msg.season);
        rows = leagues.length;
        await enqueue(
          env,
          leagues.map((l) => ({ job: "leagueMembers", season: msg.season, ...l })),
        );
        break;
      }
      case "leagueMembers":
        rows = await syncLeagueMembers(env, api, msg.season, msg.region, msg.code);
        break;
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
    throw e;
  } finally {
    await env.DB.prepare(
      "INSERT INTO sync_runs (started_at, job, target, requests, not_modified, rows_written, ms, error) VALUES (?,?,?,?,?,?,?,?)",
    )
      .bind(
        new Date(started).toISOString(),
        msg.job,
        target,
        api.requests,
        api.notModified,
        rows,
        Date.now() - started,
        error,
      )
      .run();
  }
}

async function backfill(env: Env, step: string | null) {
  if (step === "matches") {
    const today = new Date().toISOString().slice(0, 10);
    const { results } = await env.DB.prepare(
      "SELECT code FROM events WHERE season = ? AND substr(date_start, 1, 10) <= ?",
    )
      .bind(season, today)
      .all<{ code: string }>();
    await enqueue(
      env,
      results.flatMap(({ code }): SyncMessage[] => [
        { job: "eventMatches", season, code, force: true },
        { job: "awards", season, code, force: true },
      ]),
    );
    return { enqueued: results.length };
  }
  await enqueue(env, [
    { job: "events", season },
    { job: "teams", season, page: 1 },
    { job: "leagues", season },
  ]);
  return { enqueued: ["events", "teams", "leagues"], next: "POST /admin/backfill?step=matches" };
}

export default {
  async scheduled(controller, env, ctx) {
    switch (controller.cron) {
      case "* * * * *":
        await enqueue(env, await planLive(env, season));
        break;
      case "0 */6 * * *":
        await enqueue(env, [
          { job: "events", season },
          { job: "leagues", season },
        ]);
        break;
      case "30 9 * * *": {
        const codes = await recentEvents(env, season);
        await enqueue(env, [
          { job: "teams", season, page: 1 },
          ...codes.flatMap((code): SyncMessage[] => [
            { job: "eventMatches", season, code, force: true },
            { job: "awards", season, code, force: true },
          ]),
        ]);
        // Keep the observability table bounded.
        ctx.waitUntil(
          env.DB.prepare("DELETE FROM sync_runs WHERE started_at < ?")
            .bind(new Date(Date.now() - 14 * 86_400_000).toISOString())
            .run(),
        );
        break;
      }
    }
  },

  async queue(batch, env) {
    for (const m of batch.messages) {
      try {
        await runJob(env, m.body);
        m.ack();
      } catch (e) {
        console.error("job failed", JSON.stringify(m.body), e);
        m.retry({ delaySeconds: Math.min(300, 15 * 2 ** m.attempts) });
      }
    }
  },

  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === "/health") return Response.json({ ok: true, season, now: nowIso() });

    if (url.pathname.startsWith("/admin/")) {
      if (!env.ADMIN_TOKEN || req.headers.get("Authorization") !== `Bearer ${env.ADMIN_TOKEN}`) {
        return new Response("unauthorized", { status: 401 });
      }
      if (req.method === "POST" && url.pathname === "/admin/backfill") {
        return Response.json(await backfill(env, url.searchParams.get("step")));
      }
      if (req.method === "POST" && url.pathname === "/admin/sync-event") {
        const code = url.searchParams.get("code");
        if (!code) return new Response("code required", { status: 400 });
        await enqueue(env, [{ job: "eventMatches", season, code, force: true }]);
        return Response.json({ enqueued: code });
      }
      if (url.pathname === "/admin/runs") {
        const { results } = await env.DB.prepare("SELECT * FROM sync_runs ORDER BY id DESC LIMIT 100").all();
        return Response.json(results);
      }
    }
    return new Response("ftcref-sync", { status: 404 });
  },
} satisfies ExportedHandler<Env, SyncMessage>;
