import { raw } from "hono/html";
import type { Child } from "hono/jsx";
import { CSS, FAVICON_DATA_URI, SORT_JS, THEME_HEAD_JS, THEME_TOGGLE_JS } from "../assets";
import { ldScript } from "../jsonld";

export function Layout(props: {
  title: string;
  description?: string;
  /** schema.org object, rendered as JSON-LD. */
  jsonLd?: Record<string, unknown>;
  children: Child;
}) {
  // The doctype keeps browsers out of quirks mode, where tables don't inherit font size or color.
  return (
    <>
      {raw("<!doctype html>")}
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width,initial-scale=1" />
          <title>{props.title} | FTC-Reference</title>
          {props.description && <meta name="description" content={props.description} />}
          <meta property="og:site_name" content="FTC-Reference" />
          <meta property="og:type" content="website" />
          <meta property="og:title" content={`${props.title} | FTC-Reference`} />
          {props.description && <meta property="og:description" content={props.description} />}
          <meta name="twitter:card" content="summary" />
          {props.jsonLd && <script type="application/ld+json">{raw(ldScript(props.jsonLd))}</script>}
          <link rel="icon" type="image/svg+xml" href={FAVICON_DATA_URI} />
          <script>{raw(THEME_HEAD_JS)}</script>
          <style>{raw(CSS)}</style>
        </head>
        <body>
          <div class="top">
            <div class="in">
              <a class="logo" href="/">
                FTC<b>·</b>Reference
              </a>
              <nav>
                <a href="/events/2026">Events</a>
                <a href="/seasons/2026/leaders">Leaders</a>
                <a href="/seasons">Seasons</a>
              </nav>
              <form action="/search">
                <input
                  name="q"
                  type="search"
                  placeholder="Search teams, events…  ( / )"
                  aria-label="Search"
                />
              </form>
              <button type="button" id="tt" class="tt" aria-label="Toggle color theme">
                ◐ Auto
              </button>
              <a
                id="os"
                class="os"
                href="?stats=all"
                role="switch"
                aria-checked="false"
                title="Off-season events are left out of records and leaderboards"
              >
                Off-season
                <i />
              </a>
            </div>
          </div>
          <main>{props.children}</main>
          <footer>
            Data from the{" "}
            <a href="https://ftc-events.firstinspires.org/services/API">FIRST Tech Challenge Events API</a>.
            Non-commercial fan site; not affiliated with <i>FIRST</i>®. Stats recomputed as results post.
            <nav class="fl-links">
              <a href="/contact">Contact</a>
              <a href="/privacy">Privacy</a>
              <a href="/terms">Terms</a>
              <a href="https://github.com/ColinSherman/ftc-reference">GitHub</a>
            </nav>
          </footer>
          <script>{raw(SORT_JS + THEME_TOGGLE_JS)}</script>
        </body>
      </html>
    </>
  );
}

/** Sortable stats table. Wrap in .scroll so wide tables scroll horizontally on phones. */
export function Table(props: { children: Child; id?: string }) {
  return (
    <div class="scroll">
      <table class="st" id={props.id}>
        {props.children}
      </table>
    </div>
  );
}

export const f1 = (x: number | null | undefined) => (x == null ? "" : x.toFixed(1));
export const f2 = (x: number | null | undefined) => (x == null ? "" : x.toFixed(2));
export const wlt = (w: number, l: number, t: number) => `${w}-${l}-${t}`;

export function Flower(props: { s: string }) {
  if (!props.s) return <span class="note">—</span>;
  return (
    <span class="fl" title="bottom → top">
      {[...props.s].map((c) => (
        <i class={c}>{c === "P" ? "•" : "●"}</i>
      ))}
    </span>
  );
}

export const fmtDate = (iso: string | null) => (iso ? iso.slice(0, 10) : "");
export const fmtDateRange = (a: string, b: string) => {
  const s = a.slice(0, 10);
  const e = b.slice(0, 10);
  return s === e ? s : `${s} – ${e.slice(5)}`;
};

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** Compact range for narrow cells: "Oct 10", "Oct 10–11", "Dec 31–Jan 2". */
export const fmtShortRange = (a: string, b: string) => {
  const [, am, ad] = a.slice(0, 10).split("-").map(Number) as [number, number, number];
  const [, bm, bd] = b.slice(0, 10).split("-").map(Number) as [number, number, number];
  const s = `${MON[am - 1]} ${ad}`;
  if (a.slice(0, 10) === b.slice(0, 10)) return s;
  return am === bm ? `${s}–${bd}` : `${s}–${MON[bm - 1]} ${bd}`;
};
