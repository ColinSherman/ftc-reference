import { Hono } from "hono";
import { FAVICON_SVG } from "./assets";
import type { Env } from "./env";
import { adminRoutes } from "./routes/admin";
import { avatarRoutes } from "./routes/avatar";
import { channelRoutes } from "./routes/channels";
import { eventRoutes } from "./routes/event";
import { homeRoutes } from "./routes/home";
import { matchRoutes } from "./routes/match";
import { teamRoutes } from "./routes/team";
import { videoRoutes } from "./routes/videos";
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

// `?stats=all|official` remembers the leaderboard scope, then returns to the clean URL.
app.use("*", async (c, next) => {
  if (c.req.method === "GET") {
    const stats = c.req.query("stats");
    if (stats === "all" || stats === "official") {
      const url = new URL(c.req.url);
      url.searchParams.delete("stats");
      const res = c.redirect(`${url.pathname}${url.search}`, 303);
      res.headers.append("Set-Cookie", `stats=${stats}; Path=/; Max-Age=31536000; SameSite=Lax`);
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
app.route("/teams", teamRoutes);
app.route("/events", eventRoutes);
app.route("/events", matchRoutes);
app.route("/", adminRoutes);
app.route("/", channelRoutes);
app.route("/", videoRoutes);
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
