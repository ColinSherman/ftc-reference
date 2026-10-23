import { ALL_SEASONS, type Component, SEASONS, seasonLabel } from "@ftcref/seasons";
import type { Child } from "hono/jsx";
import { flagCode, placeTitle } from "../flags";
import { overRuns } from "../overhead";

/**
 * Team avatar tile. Images are FIRST's 40×40 PNGs served from our own domain with immutable
 * caching; at 20px they're crisp on 2× screens. Fixed width/height means no layout shift, and
 * lazy loading keeps long tables cheap. Teams without an avatar get an empty tile (no request).
 */
export function Av(props: { team: number; k?: string | null; size?: "sm" | "xl" }) {
  const cls = props.size === "xl" ? "av xl" : "av";
  const px = props.size === "xl" ? 80 : 20;
  if (!props.k) return <span class={`${cls} av0`} aria-hidden="true" />;
  return (
    <img
      class={cls}
      src={`/a/${props.team}-${props.k}.png`}
      width={px}
      height={px}
      loading={props.size === "xl" ? "eager" : "lazy"}
      decoding="async"
      alt=""
    />
  );
}

/** Country flag (flagcdn PNG, 2× via srcset); `title` is the hover text (location + region). Renders nothing if unknown. */
export function Flag(props: { code: string | null; title?: string }) {
  if (!props.code) return null;
  return (
    <img
      class="flag"
      src={`https://flagcdn.com/w20/${props.code}.png`}
      srcset={`https://flagcdn.com/w40/${props.code}.png 2x`}
      width={20}
      height={15}
      loading="lazy"
      decoding="async"
      alt={props.code.toUpperCase()}
      title={props.title}
    />
  );
}

/**
 * "[avatar] Name" cell content linking to the team page. `num` prefixes the team number (so tables
 * don't need a separate number column); `sub` adds a small second line (location, etc.); `season`
 * deep-links to that season of the team page.
 */
export function TeamName(props: {
  team: number;
  name: string | null | undefined;
  av?: string | null;
  num?: boolean;
  sub?: string | null;
  season?: number;
  /** Team location; renders a country flag whose hover shows place + region. */
  loc?: {
    city?: string | null;
    state_prov?: string | null;
    country?: string | null;
    home_region?: string | null;
  };
}) {
  const href = props.season ? `/teams/${props.team}?season=${props.season}` : `/teams/${props.team}`;
  return (
    <>
      <Av team={props.team} k={props.av} />
      {props.loc && (
        <Flag code={flagCode(props.loc.country, props.loc.home_region)} title={placeTitle(props.loc)} />
      )}
      <a href={href} class="tn" title={props.name ?? undefined}>
        {props.num && <b class="num">{props.team}</b>} {props.name ?? (props.num ? "" : `Team ${props.team}`)}
      </a>
      {props.sub && <div class="sub ind">{props.sub}</div>}
    </>
  );
}

/** Fixed-width first-column cell holding the ▶ link (or nothing) so video buttons line up vertically. */
export function VidCell(props: { href: string; has: boolean | number }) {
  return (
    <td class="vc">
      {props.has ? (
        <a class="vid" href={`${props.href}#video`} title="Watch">
          ▶
        </a>
      ) : (
        ""
      )}
    </td>
  );
}

/** Compact "[avatar]number" links for a list of teams (match tables). */
export function TeamLinks(props: {
  teams: { team: number; av?: string | null }[];
  season: number;
  hi?: Set<number>;
}) {
  return (
    <>
      {props.teams.map((t) => (
        <a class="tl" href={`/teams/${t.team}?season=${props.season}`}>
          <Av team={t.team} k={t.av} />
          {t.team}
        </a>
      ))}
    </>
  );
}

export const STAT_TIPS: Record<string, string> = {
  Rk: "Official event rank",
  "W-L-T": "Wins-losses-ties (qualification matches)",
  RS: "Ranking score: average ranking points per match",
  TB1: "First tiebreaker (official sort order 2)",
  TB2: "Second tiebreaker (official sort order 3)",
  Pl: "Matches played",
  "NP OPR":
    "No-penalty Offensive Power Rating: points this team adds to its alliance per match, excluding fouls. Least-squares fit over qualification matches.",
  Auto: "Auto OPR: autonomous points contributed per match",
  TeleOp: "TeleOp OPR: driver-controlled points contributed per match",
  Tips: "HIVE tips contributed per match (auto + teleop)",
  Hive: "TeleOp HIVE points contributed per match (tips + pieces in up-facing CELLs)",
  Flower: "FLOWER points contributed per match",
  Garden: "GARDEN points contributed per match",
  Park: "LEAVE + PARK points contributed per match",
  DPR: "Defensive Power Rating: opponents' no-penalty points allowed per match (lower is better)",
  CCWM: "Calculated Contribution to Winning Margin = NP OPR − DPR",
  "Avg NP": "Average alliance no-penalty score in this team's matches (includes partners)",
  "Max NP": "Highest alliance no-penalty score in this team's matches",
  Endgame: "Endgame OPR: end-of-match points (park/ascent/drone…) contributed per match",
  "RP/M": "Ranking points per match",
  "Best NP": "Best single-event NP OPR this season",
  "Latest NP": "NP OPR at the team's most recent event",
  Ev: "Events played",
  "Own NP": "This alliance's no-penalty score",
  "Opp NP": "Opponent alliance's no-penalty score",
};

/** Marks a number that includes scores corrected from what the event reported. */
export const Adj = () => <span title="Includes corrected scores (see the event page)">*</span>;

export const AdjNote = () => (
  <p class="note">* Includes scores corrected for an event's scoring error; may still be overstated.</p>
);

/** Header cell with a hover definition. `l` left-aligns. */

export function Th(props: { k: string; l?: boolean; label?: string }) {
  return (
    <th class={props.l ? "l" : undefined} title={STAT_TIPS[props.k]}>
      {props.label ?? props.k}
    </th>
  );
}

/** Sports-Reference-style grouping row above a table's column headers (see `overRuns`). */
export function OverHead(props: { lead: number; groups: string[] }) {
  return (
    <tr class="over">
      {overRuns(props.lead, props.groups).map(([g, n]) => (
        <th colspan={n} class={g ? undefined : "sp"}>
          {g}
        </th>
      ))}
    </tr>
  );
}

/**
 * KenPom/FanGraphs-style cell shading. Returns a style for each value: only above-median values
 * get tinted, increasingly toward the top of the column. `invert` for lower-is-better stats.
 */
export function heatScale(values: (number | null | undefined)[], invert = false) {
  const xs = values.filter((v): v is number => v != null && Number.isFinite(v)).sort((a, b) => a - b);
  if (xs.length < 4) return (_: number | null | undefined) => undefined;
  return (v: number | null | undefined) => {
    if (v == null) return undefined;
    let lo = 0;
    let hi = xs.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((xs[mid] as number) < v) lo = mid + 1;
      else hi = mid;
    }
    let p = lo / (xs.length - 1);
    if (invert) p = 1 - p;
    const h = Math.max(0, (p - 0.5) * 2) ** 1.4;
    return h < 0.05 ? undefined : `--h:${h.toFixed(2)}`;
  };
}

/** Big number tile for page headers (record, OPR, rank…). */
export function StatBox(props: { label: string; value: Child; sub?: Child; tip?: string }) {
  return (
    <div class="sb" title={props.tip}>
      <div class="sbv">{props.value}</div>
      <div class="sbl">{props.label}</div>
      {props.sub && <div class="sbs">{props.sub}</div>}
    </div>
  );
}

/** Titled box used on the home page grid. */
export function Box(props: { title: string; more?: { href: string; label: string }; children: Child }) {
  return (
    <section class="box">
      <h3>
        {props.title}
        {props.more && (
          <a class="more" href={props.more.href}>
            {props.more.label} »
          </a>
        )}
      </h3>
      {props.children}
    </section>
  );
}

export function Result(props: { r: "W" | "L" | "T" | "" }) {
  if (!props.r) return <span class="note">–</span>;
  return <span class={`res res${props.r}`}>{props.r}</span>;
}

export type EventStatus = "live" | "upcoming" | "final";

export function eventStatus(
  start: string,
  end: string,
  today = new Date().toISOString().slice(0, 10),
): EventStatus {
  if (today < start.slice(0, 10)) return "upcoming";
  if (today > end.slice(0, 10)) return "final";
  return "live";
}

export function StatusPill(props: { s: EventStatus }) {
  const label = props.s === "live" ? "LIVE" : props.s === "upcoming" ? "Upcoming" : "Final";
  return <span class={`pill st-${props.s}`}>{label}</span>;
}

/** Season dropdown that navigates on change (plain links in <noscript> would be overkill here). */
export function SeasonSelect(props: { current: number; href: (season: number) => string }) {
  const attrs = { onchange: "location.href=this.value" } as Record<string, string>;
  return (
    <select class="ssel" aria-label="Season" {...attrs}>
      {ALL_SEASONS.map((s) => (
        <option value={props.href(s)} selected={s === props.current}>
          {seasonLabel(s)} {SEASONS[s]?.game}
        </option>
      ))}
    </select>
  );
}

/** Header for a season-specific OPR component (label + tip come from the season descriptor). */
export function CompTh(props: { c: Component; prefix?: string }) {
  return <th title={props.c.tip}>{props.prefix ? `${props.prefix} ${props.c.label}` : props.c.label}</th>;
}
