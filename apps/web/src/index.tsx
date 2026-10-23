import { Hono } from "hono";
import { FAVICON_SVG } from "./assets";
import type { Env } from "./env";
import { pageSizeOf } from "./paging";
import { adminRoutes } from "./routes/admin";
import { avatarRoutes } from "./routes/avatar";
import { channelRoutes } from "./routes/channels";
import { eventRoutes } from "./routes/event";
import { homeRoutes } from "./routes/home";
import { legalRoutes } from "./routes/legal";
import { matchRoutes } from "./routes/match";
import { mediaRoutes } from "./routes/media";
import { teamRoutes } from "./routes/team";
import { videoRoutes } from "./routes/videos";
import { seoHead } from "./seoTags";
import { Layout } from "./views/layout";

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

// Canonical URL and indexability. Done here (not in Layout) so every page gets it, cached or not.
app.use("*", async (c, next) => {
  await next();
  if (c.req.method !== "GET") return;
  const ct = c.res.headers.get("Content-Type") ?? "";
  const url = new URL(c.req.url);
  if (!ct.startsWith("text/html")) return;
  const { canonical, noindex } = seoHead(url, c.res.status);
  let res = c.res;
  if (canonical) {
    const tags = `<link rel="canonical" href="${canonical}"><meta property="og:url" content="${canonical}">`;
    res = new HTMLRewriter()
      .on("head", {
        element(el) {
          el.append(tags, { html: true });
        },
      })
      .transform(res);
  }
  if (noindex) {
    res = new Response(res.body, res);
    res.headers.set("X-Robots-Tag", "noindex, follow");
  }
  c.res = res;
});

// `?stats=` and `?per=` remember a viewer's choice, then return to the clean URL.
app.use("*", async (c, next) => {
  if (c.req.method === "GET") {
    const stats = c.req.query("stats");
    const per = pageSizeOf(c.req.query("per"));
    const rememberStats = stats === "all" || stats === "official";
    if (rememberStats || per) {
      const url = new URL(c.req.url);
      url.searchParams.delete("stats");
      url.searchParams.delete("per");
      const res = c.redirect(`${url.pathname}${url.search}`, 303);
      if (rememberStats) {
        res.headers.append("Set-Cookie", `stats=${stats}; Path=/; Max-Age=31536000; SameSite=Lax`);
      }
      if (per) res.headers.append("Set-Cookie", `per=${per}; Path=/; Max-Age=31536000; SameSite=Lax`);
      return res;
    }
  }
  await next();
});

const favicon = () =>
  new Response(FAVICON_SVG, {
    headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=604800, immutable" },
  });
app.get("/favicon.svg", favicon);
app.get("/favicon.ico", favicon);

app.route("/a", avatarRoutes);
app.route("/", mediaRoutes);
app.route("/teams", teamRoutes);
app.route("/events", eventRoutes);
app.route("/events", matchRoutes);
app.route("/", adminRoutes);
app.route("/", channelRoutes);
app.route("/", videoRoutes);
app.route("/", legalRoutes);
app.route("/", homeRoutes);

app.notFound((c) =>
  c.html(
    <Layout title="Not found">
      <h1>Page not found</h1>
      <p>
        <a href="/">Home</a> · try the search box above (press <b>/</b>)
      </p>
    </Layout>,
    404,
  ),
);

export default app;
