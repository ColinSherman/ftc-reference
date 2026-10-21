import { nowIso } from "@ftcref/db";
import { FtcApi, Throttle } from "@ftcref/ftc-api";
import { CURRENT_SEASON, isSeason } from "@ftcref/seasons";
import { advanceBackfill } from "./backfill";
import type { Env, SyncMessage } from "./env";
import { avatarYears, fetchAvatarBatch, syncAvatars } from "./jobs/avatars";
import { syncAwards } from "./jobs/awards";
import { syncEventMatches } from "./jobs/eventMatches";
import { syncEvents } from "./jobs/events";
import { syncLeagueMembers, syncLeagues } from "./jobs/leagues";
import { alignEventStreams } from "./jobs/streams";
import { syncTeamsPage } from "./jobs/teams";
import { scanVideoChannels } from "./jobs/videos";
import { planLive, recentEvents } from "./planner";

const season = CURRENT_SEASON;
/** The v3 API and avatar files number seasons by Championship year (BIOBUZZ 2026-27 → 2027). */
const cmpYear = season + 1;
/**
 * Backfill politeness: each consumer invocation shares one throttle across its concurrently-running
 * jobs, so ≤ 5 requests/s per consumer and ≤ 10/s overall (max_concurrency 2). Live polling is unthrottled.
 */
const BACKFILL_INTERVAL_MS = 200;

/** Queues caps sendBatch at 100 messages and 256 KB; split on whichever comes first. */
async function send(queue: Queue<SyncMessage>, msgs: SyncMessage[]) {
  let batch: { body: SyncMessage }[] = [];
  let bytes = 0;
  for (const body of msgs) {
    const size = JSON.stringify(body).length + 100; // + per-message overhead
    if (batch.length && (batch.length === 100 || bytes + size > 200_000)) {
      await queue.sendBatch(batch);
      batch = [];
      bytes = 0;
    }
    batch.push({ body });
    bytes += size;
  }
  if (batch.length) await queue.sendBatch(batch);
}

const enqueue = (env: Env, msgs: SyncMessage[]) => send(env.SYNC_QUEUE, msgs);
const enqueueBulk = (env: Env, msgs: SyncMessage[]) => send(env.BACKFILL_QUEUE, msgs);

/** Log target; backfill jobs are prefixed "~" so the backfill machine can tell them from live polling. */
function targetOf(msg: SyncMessage, bulk: boolean) {
  const p = bulk ? "~" : "";
  if ("code" in msg && "season" in msg) return `${p}${msg.season}/${msg.code}`;
  if ("page" in msg) return `${p}${msg.season}/teams:${msg.page}`;
  if ("refs" in msg) return `${msg.refs.length} avatars`;
  if ("season" in msg) return `${p}${msg.season}`;
  return null;
}

/** Run one job. `again` re-enqueues fan-out work on the same queue the job came from. */
async function runJob(env: Env, msg: SyncMessage, bulk: boolean, throttle?: Throttle) {
  const api = new FtcApi({
    user: env.FTC_API_USER,
    token: env.FTC_API_TOKEN,
    baseUrl: env.FTC_API_BASE,
    throttle,
  });
  const again = (m: SyncMessage[]) => (bulk ? enqueueBulk(env, m) : enqueue(env, m));
  const started = Date.now();
  let rows = 0;
  let error: string | null = null;
  try {
    switch (msg.job) {
      case "events":
        rows = await syncEvents(env, api, msg.season);
        break;
      case "teams": {
        const r = await syncTeamsPage(env, api, msg.season, msg.page, msg.force);
        rows = r.written;
        // Page 1 fans out the remaining pages.
        if (msg.page === 1 && r.pageTotal && r.pageTotal > 1) {
          const rest = Array.from({ length: r.pageTotal - 1 }, (_, i) => i + 2);
          await again(rest.map((page) => ({ job: "teams", season: msg.season, page, force: msg.force })));
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
        await again(leagues.map((l) => ({ job: "leagueMembers", season: msg.season, ...l })));
        break;
      }
      case "leagueMembers":
        rows = await syncLeagueMembers(env, api, msg.season, msg.region, msg.code);
        break;
      case "avatars":
        rows = (await syncAvatars(env, msg.cmpYear, (m) => enqueue(env, m))).changed;
        break;
      case "avatarFetch":
        rows = await fetchAvatarBatch(env, msg.cmpYear, msg.refs);
        break;
      case "streamAlign": {
        const r = await alignEventStreams(env);
        rows = r.matches;
        break;
      }
      case "videoScan": {
        const r = await scanVideoChannels(env);
        rows = r.approved + r.pending;
        break;
      }
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
        targetOf(msg, bulk),
        api.requests,
        api.notModified,
        rows,
        Date.now() - started,
        error,
      )
      .run();
  }
}

export default {
  async scheduled(controller, env, ctx) {
    switch (controller.cron) {
      case "* * * * *": {
        const msgs = await planLive(env, season);
        // Self-heal: if avatars have never synced (fresh deploy), start now rather than at the next 6h tick.
        for (const y of avatarYears(cmpYear)) {
          const av = await env.DB.prepare("SELECT 1 FROM sync_state WHERE key = ?")
            .bind(`avatars/${y}.css`)
            .first();
          if (!av) msgs.push({ job: "avatars", cmpYear: y });
        }
        // Livestream auto-timing every 20 minutes (no-op, and no quota, when nothing new needs it).
        if (new Date().getUTCMinutes() % 20 === 7) msgs.push({ job: "streamAlign" });
        await enqueue(env, msgs);
        const step = await advanceBackfill(env, (m) => enqueueBulk(env, m));
        if (step) console.log("backfill", step);
        break;
      }
      case "0 */6 * * *":
        await enqueue(env, [
          { job: "events", season },
          { job: "leagues", season },
          ...avatarYears(cmpYear).map((y): SyncMessage => ({ job: "avatars", cmpYear: y })),
          { job: "videoScan" },
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
    const bulk = batch.queue === env.BACKFILL_QUEUE_NAME;
    const handle = async (m: Message<SyncMessage>, throttle?: Throttle) => {
      try {
        await runJob(env, m.body, bulk, throttle);
        m.ack();
      } catch (e) {
        console.error("job failed", JSON.stringify(m.body), e);
        m.retry({ delaySeconds: Math.min(300, 15 * 2 ** m.attempts) });
      }
    };
    if (bulk) {
      // Run the batch concurrently: jobs spend most of their time in D1, so the shared throttle
      // (not serial processing) is what bounds the request rate.
      const throttle = new Throttle(BACKFILL_INTERVAL_MS);
      await Promise.all(batch.messages.map((m) => handle(m, throttle)));
    } else {
      for (const m of batch.messages) await handle(m);
    }
  },

  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === "/health") return Response.json({ ok: true, season, now: nowIso() });

    if (url.pathname.startsWith("/admin/")) {
      if (!env.ADMIN_TOKEN || req.headers.get("Authorization") !== `Bearer ${env.ADMIN_TOKEN}`) {
        return new Response("unauthorized", { status: 401 });
      }
      const s = Number(url.searchParams.get("season") ?? season);
      if (!isSeason(s)) return new Response("unknown season", { status: 400 });
      if (req.method === "POST" && url.pathname === "/admin/backfill") {
        // Restart the backfill state machine for one season (or all with ?season=all is not supported).
        await env.DB.prepare("UPDATE seasons SET backfill_stage = NULL, backfilled_at = NULL WHERE year = ?")
          .bind(s)
          .run();
        return Response.json({ restarted: s });
      }
      if (req.method === "POST" && url.pathname === "/admin/sync-event") {
        const code = url.searchParams.get("code");
        if (!code) return new Response("code required", { status: 400 });
        await enqueue(env, [{ job: "eventMatches", season: s, code: code.toUpperCase(), force: true }]);
        return Response.json({ enqueued: `${s}/${code}` });
      }
      if (url.pathname === "/admin/status") {
        const [seasons, runs] = await env.DB.batch([
          env.DB.prepare(
            "SELECT year, backfill_stage, backfill_stage_at, backfilled_at FROM seasons ORDER BY year DESC",
          ),
          env.DB.prepare(
            "SELECT substr(target, 1, 5) AS season, COUNT(*) AS jobs, SUM(requests) AS requests, SUM(error IS NOT NULL) AS errors FROM sync_runs WHERE started_at > ? GROUP BY 1",
          ).bind(new Date(Date.now() - 3_600_000).toISOString()),
        ]);
        return Response.json({ seasons: seasons?.results, lastHour: runs?.results });
      }
      if (url.pathname === "/admin/runs") {
        const { results } = await env.DB.prepare("SELECT * FROM sync_runs ORDER BY id DESC LIMIT 100").all();
        return Response.json(results);
      }
    }
    return new Response("ftcref-sync", { status: 404 });
  },
} satisfies ExportedHandler<Env, SyncMessage>;
