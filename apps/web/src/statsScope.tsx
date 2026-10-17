import { getCookie } from "hono/cookie";
import type { AppContext } from "./env";

export type StatsMode = "official" | "all";

/** Cookie `stats=all` includes scrimmages and off-season. Anything else is official events only. */
export function statsMode(c: AppContext): StatsMode {
  return getCookie(c, "stats") === "all" ? "all" : "official";
}

export function seasonStatsTable(mode: StatsMode): "team_season_stats" | "team_official_stats" {
  return mode === "all" ? "team_season_stats" : "team_official_stats";
}

/** Link that sets the cookie (the middleware redirects back without the query param). */
export function statsToggleHref(url: string, mode: StatsMode): string {
  const u = new URL(url);
  u.searchParams.set("stats", mode === "official" ? "all" : "official");
  return `${u.pathname}${u.search}`;
}

export function StatsScope(props: { url: string; mode: StatsMode; hidden?: number }) {
  const include = props.mode === "all";
  const href = statsToggleHref(props.url, props.mode);
  const hidden =
    !include && props.hidden
      ? ` ${props.hidden} unofficial event${props.hidden === 1 ? "" : "s"} hidden on this page.`
      : "";
  return (
    <p class="note scope">
      <label>
        <input
          type="checkbox"
          {...(include ? { checked: true } : {})}
          {...({ onchange: `location.href=${JSON.stringify(href)}` } as Record<string, string>)}
        />
        Include scrimmages and off-season in records and leaderboards
      </label>
      {hidden}
    </p>
  );
}
