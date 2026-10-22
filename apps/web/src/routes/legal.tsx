import { Hono } from "hono";
import { cached } from "../cache";
import type { Env } from "../env";
import { Layout } from "../views/layout";

export const legalRoutes = new Hono<{ Bindings: Env }>();

/** Forwarded to the owner's inbox by Cloudflare Email Routing (set up on the ftc-reference.com zone). */
export const CONTACT_EMAIL = "contact@ftc-reference.com";
export const REPO_URL = "https://github.com/ColinSherman/ftc-reference";
const UPDATED = "October 22, 2026";

const Mail = () => <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>;

// Static pages: the deploy id in the cache key refreshes them on every release.
const STATIC_TTL = 86_400;

legalRoutes.get("/contact", (c) =>
  cached(c, { ttl: STATIC_TTL }, async () =>
    c.html(
      <Layout title="Contact" description="Contact FTC-Reference: questions, corrections, takedown requests.">
        <div class="prose">
          <h1>Contact</h1>
          <p>
            FTC-Reference is run by one volunteer. Email <Mail /> for anything about the site: questions,
            feature ideas, wrong or missing data, photo or video removal, or privacy requests.
          </p>
          <h2>Before you write</h2>
          <ul>
            <li>
              <b>Match results, rankings, awards and team info</b> come from the{" "}
              <a href="https://ftc-events.firstinspires.org/">FIRST Tech Challenge Events</a> service. If a
              score is wrong there, the event's scorekeeper or <i>FIRST</i> has to fix it; it updates here
              automatically once they do. Still tell us if something looks wrong only on this site.
            </li>
            <li>
              <b>Videos and robot photos</b> are links submitted by visitors. To have one removed, send the
              page link and why. Removal requests from a team about its own robot are always honored.
            </li>
            <li>
              <b>Bugs and feature requests</b> can also go on <a href={`${REPO_URL}/issues`}>GitHub Issues</a>
              ; the site's code is public.
            </li>
          </ul>
          <p class="note">
            This site is not run by <i>FIRST</i>. For questions about the competition itself, contact{" "}
            <a href="https://www.firstinspires.org/">FIRST</a> directly.
          </p>
        </div>
      </Layout>,
    ),
  ),
);

legalRoutes.get("/privacy", (c) =>
  cached(c, { ttl: STATIC_TTL }, async () =>
    c.html(
      <Layout title="Privacy Policy" description="What FTC-Reference collects and why.">
        <div class="prose">
          <h1>Privacy Policy</h1>
          <p class="note">Last updated {UPDATED}</p>
          <p>
            FTC-Reference ("the site", "we") is a free, non-commercial fan site for <i>FIRST</i> Tech
            Challenge statistics. We collect as little as we can. There are no accounts, no ads, and no
            analytics or tracking scripts.
          </p>

          <h2>What we store</h2>
          <ul>
            <li>
              <b>Preference cookies.</b> <code>stats</code> (whether off-season events count) and{" "}
              <code>per</code> (rows per page) are set only when you change those settings. They hold that
              choice and nothing else.
            </li>
            <li>
              <b>Theme.</b> Your light/dark choice is kept in your browser's local storage and never sent to
              us.
            </li>
            <li>
              <b>Submissions.</b> If you submit a video or photo link, we store the link, any caption, the
              optional "name or team" you typed, and the time. The name is seen only by the site's moderator;
              it is not shown publicly. Approved links appear on team, event and match pages.
            </li>
          </ul>

          <h2>What our providers see</h2>
          <ul>
            <li>
              <b>Cloudflare</b> hosts the site. Like any web host it processes your IP address, browser
              details and the pages you request to deliver and protect the site; see{" "}
              <a href="https://www.cloudflare.com/privacypolicy/">Cloudflare's privacy policy</a>. We do not
              keep our own access logs or build profiles of visitors.
            </li>
            <li>
              <b>Embedded and linked content.</b> Team pages show robot photos from Imgur and embedded
              Instagram posts, and match videos link to YouTube. When an image or embed loads, or you follow a
              link, your browser contacts that service directly and its own privacy policy applies (
              <a href="https://privacycenter.instagram.com/policy">Instagram</a>,{" "}
              <a href="https://imgurinc.com/privacy">Imgur</a>,{" "}
              <a href="https://policies.google.com/privacy">YouTube/Google</a>).
            </li>
            <li>
              <b>Email.</b> Messages to <Mail /> are forwarded by Cloudflare Email Routing to a personal inbox
              and kept only as long as needed to answer them.
            </li>
          </ul>

          <h2>Public competition data</h2>
          <p>
            Team numbers, names, locations, awards and match results are published by <i>FIRST</i> through the
            FIRST Tech Challenge Events API and shown here as published. They describe teams, not individual
            students.
          </p>

          <h2>Children</h2>
          <p>
            Many FTC participants are minors. The site does not ask for personal information, and we do not
            knowingly collect it from children under 13. Please don't put a student's full name in the
            optional submission field; a team number is plenty. If you believe a child's information is on the
            site, email <Mail /> and we'll remove it.
          </p>

          <h2>Your choices</h2>
          <p>
            You can clear the cookies at any time in your browser; the site works without them. To have a
            submission or anything else about you removed, email <Mail />. We don't sell or share data with
            anyone.
          </p>

          <h2>Changes</h2>
          <p>If this policy changes, the new version will be posted here with a new date.</p>
        </div>
      </Layout>,
    ),
  ),
);

legalRoutes.get("/terms", (c) =>
  cached(c, { ttl: STATIC_TTL }, async () =>
    c.html(
      <Layout title="Terms of Use" description="Terms for using FTC-Reference.">
        <div class="prose">
          <h1>Terms of Use</h1>
          <p class="note">Last updated {UPDATED}</p>
          <p>
            By using FTC-Reference you agree to these terms. If you don't agree, please don't use the site.
          </p>

          <h2>Not affiliated with FIRST</h2>
          <p>
            FTC-Reference is an independent, non-commercial fan project. It is not affiliated with, endorsed
            by, or sponsored by <i>FIRST</i>®. <i>FIRST</i>®, <i>FIRST</i>® Tech Challenge and FTC® are
            trademarks of For Inspiration and Recognition of Science and Technology (<i>FIRST</i>). Other
            names and logos belong to their owners.
          </p>

          <h2>Data and accuracy</h2>
          <p>
            Competition data comes from the{" "}
            <a href="https://ftc-events.firstinspires.org/services/API">FIRST Tech Challenge Events API</a>,
            and derived statistics (OPR, averages, rankings and the like) are computed by this site. Both can
            be late, incomplete or wrong. Official results are the ones published by <i>FIRST</i>; don't rely
            on this site for anything that matters, such as advancement or award decisions.
          </p>

          <h2>Using the site</h2>
          <ul>
            <li>Personal, educational and team scouting use is welcome.</li>
            <li>
              Automated access is fine at a polite rate. Don't overload the site, get around its limits, or
              mirror it wholesale; for bulk data, use the{" "}
              <a href="https://ftc-events.firstinspires.org/services/API">FTC Events API</a> directly.
            </li>
            <li>Don't use the site to harass anyone, or to break the law or the rules of the competition.</li>
          </ul>

          <h2>Submissions</h2>
          <p>
            When you submit a video or photo link, you confirm that sharing it doesn't violate anyone's rights
            or the host platform's rules, and you allow the site to link to and display it. The content stays
            its owner's; the site only links or embeds it. We may decline or remove any submission at any
            time, and will remove content at the request of its owner or the team shown.
          </p>

          <h2>Third-party content</h2>
          <p>
            The site links to and embeds content hosted by others (YouTube, Instagram, Imgur, <i>FIRST</i>).
            We don't control that content and aren't responsible for it; those services' own terms apply.
          </p>

          <h2>No warranty</h2>
          <p>
            The site is provided "as is" and "as available", free of charge, without warranties of any kind.
            To the fullest extent allowed by law, the site's operator is not liable for any damages arising
            from your use of, or inability to use, the site or its data.
          </p>

          <h2>Changes</h2>
          <p>
            These terms may be updated; the current version is always on this page. Questions: <Mail />.
          </p>
        </div>
      </Layout>,
    ),
  ),
);
