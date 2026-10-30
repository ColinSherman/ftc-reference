import { pacificDay } from "@ftcref/videos";
import { hasSessionCookie } from "./admin";
import type { AppContext, Env } from "./env";

/**
 * Page-view counts in Workers Analytics Engine: no cookies, no stored IPs, nothing in D1.
 *
 * One data point per human page load (a browser navigation to an HTML page). The visitor id is a
 * hash of IP + user agent + a random salt that rotates daily and expires from KV after two days,
 * so a visitor can be counted once per day but never followed across days, and the hash can't be
 * reversed once the salt is gone. Days are Pacific, like the rest of /admin.
 *
 *   index1 = visitor id   blob1 = path   blob2 = country   blob3 = "mobile" | "desktop"
 *   blob4 = referrer host (other sites only)   blob5 = "1" when a session cookie was sent
 */

const BOT_UA =
  /bot|crawl|spider|indexer|compatible;|slurp|preview|headless|lightpanda|python|curl|wget|httpclient|java\/|go-http/i;

/** A real browser's top-level page load (not a bot, prefetch, fetch() or embedded resource). */
export function isHumanPageView(req: Request, res: Response): boolean {
  if (req.method !== "GET" || res.status !== 200) return false;
  if (!(res.headers.get("Content-Type") ?? "").startsWith("text/html")) return false;
  const h = req.headers;
  if (h.get("sec-fetch-mode") !== "navigate" || h.get("sec-fetch-dest") !== "document") return false;
  if (h.get("sec-purpose") || h.get("purpose")) return false; // prefetch / prerender
  const ua = h.get("user-agent") ?? "";
  return ua.length > 0 && !BOT_UA.test(ua);
}

let salt: { day: string; value: string } | undefined;

/** Today's salt: one KV read per isolate per day; created by the first request of the day. */
async function dailySalt(kv: KVNamespace, day: string): Promise<string> {
  if (salt?.day === day) return salt.value;
  const key = `visitor-salt:${day}`;
  let value = await kv.get(key);
  if (!value) {
    value = crypto.randomUUID();
    await kv.put(key, value, { expirationTtl: 2 * 86400 });
  }
  salt = { day, value };
  return value;
}

async function visitorId(env: Env, req: Request, day: string): Promise<string> {
  const ip = req.headers.get("cf-connecting-ip") ?? "";
  const ua = req.headers.get("user-agent") ?? "";
  const data = new TextEncoder().encode(`${await dailySalt(env.CACHE_VER, day)}|${ip}|${ua}`);
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
  return [...hash.slice(0, 8)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const refHost = (req: Request, site: string) => {
  try {
    const host = new URL(req.headers.get("referer") ?? "").hostname;
    return host === site ? "" : host;
  } catch {
    return "";
  }
};

/** Record the page view (after the response is sent). A no-op without the PAGEVIEWS binding. */
export function recordPageView(c: AppContext) {
  const ds = c.env.PAGEVIEWS;
  if (!ds || !isHumanPageView(c.req.raw, c.res)) return;
  const req = c.req.raw;
  const url = new URL(req.url);
  const signedIn = hasSessionCookie(c) ? "1" : "0";
  const mobile = /Mobi|Android|iPhone|iPad/.test(req.headers.get("user-agent") ?? "") ? "mobile" : "desktop";
  const country = String((req as { cf?: { country?: string } }).cf?.country ?? "");
  c.executionCtx.waitUntil(
    visitorId(c.env, req, pacificDay())
      .then((id) =>
        ds.writeDataPoint({
          indexes: [id],
          blobs: [url.pathname.slice(0, 200), country, mobile, refHost(req, url.hostname), signedIn],
          doubles: [1],
        }),
      )
      .catch(() => {}),
  );
}

// ----------------------------------------------------------------------------- admin reports

export type TrafficDay = { day: string; visitors: number; views: number; signed_in: number; mobile: number };
export type TrafficTop = { key: string; views: number; visitors: number };
export type Traffic = {
  days: TrafficDay[];
  pages: TrafficTop[];
  countries: TrafficTop[];
  referrers: TrafficTop[];
};

const TZ = "America/Los_Angeles";

/** The last 14 Pacific days and 7-day tops, via the Analytics Engine SQL API. Null if not configured. */
export async function trafficReport(env: Env): Promise<Traffic | null> {
  const dataset = env.PAGEVIEWS_DATASET;
  if (!env.CF_ANALYTICS_TOKEN || !env.CF_ACCOUNT_ID || !dataset || !/^\w+$/.test(dataset)) return null;
  const sql = async <T>(q: string): Promise<T[]> => {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/analytics_engine/sql`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${env.CF_ANALYTICS_TOKEN}` },
        body: `${q} FORMAT JSON`,
      },
    );
    if (!res.ok) throw new Error(`Analytics Engine ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return ((await res.json()) as { data: T[] }).data;
  };
  const top = (col: string, where = "") =>
    sql<TrafficTop>(
      `SELECT ${col} AS key, SUM(_sample_interval) AS views, count(DISTINCT index1) AS visitors
       FROM ${dataset} WHERE timestamp > NOW() - INTERVAL '7' DAY ${where}
       GROUP BY key ORDER BY views DESC LIMIT 15`,
    );
  const [days, pages, countries, referrers] = await Promise.all([
    sql<TrafficDay>(
      `SELECT formatDateTime(timestamp, '%Y-%m-%d', '${TZ}') AS day, count(DISTINCT index1) AS visitors,
         SUM(_sample_interval) AS views, sumIf(_sample_interval, blob5 = '1') AS signed_in,
         sumIf(_sample_interval, blob3 = 'mobile') AS mobile
       FROM ${dataset} WHERE timestamp > NOW() - INTERVAL '14' DAY
       GROUP BY day ORDER BY day DESC`,
    ),
    top("blob1"),
    top("blob2"),
    top("blob4", "AND blob4 != ''"),
  ]);
  const num = <T extends object>(rows: T[]) =>
    rows.map((r) =>
      Object.fromEntries(Object.entries(r).map(([k, v]) => [k, k === "day" || k === "key" ? v : Number(v)])),
    ) as T[];
  return { days: num(days), pages: num(pages), countries: num(countries), referrers: num(referrers) };
}
