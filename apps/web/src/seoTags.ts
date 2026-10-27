/** Query params that never change a page's content; stripped before deciding whether a URL is a variant. */
const TRACKING = /^(utm_\w+|fbclid|gclid|msclkid|ref|ref_src|igshid|mc_[ce]id)$/i;

/** Paths that should never be indexed, whatever their status. */
const PRIVATE = /^\/(admin|search|videos|a|api|account|login)(\/|$)/;

export interface SeoHead {
  /** Absolute canonical URL, or null when the page shouldn't declare one (noindex pages). */
  canonical: string | null;
  noindex: boolean;
}

/** Crawlers (and opt-out tokens) that only collect content for AI training; they send no visitors. */
const TRAINING_BOTS = [
  "GPTBot",
  "ClaudeBot",
  "CCBot",
  "Bytespider",
  "Amazonbot",
  "Meta-ExternalAgent",
  "Google-Extended",
  "Applebot-Extended",
];

/**
 * robots.txt. Anything but the apex (staging, *.workers.dev) is closed to all crawlers. The apex allows
 * search and AI answers, says no to training, and keeps bots off pages that are forms, private, or
 * cookie-toggle variants of other pages (crawled ~650k times a week before this).
 */
export function robotsTxt(host: string, apexHost = "ftc-reference.com"): string {
  if (host !== apexHost) return "User-agent: *\nDisallow: /\n";
  return [
    ...TRAINING_BOTS.map((b) => `User-agent: ${b}`),
    "Disallow: /",
    "",
    "User-agent: *",
    "Content-Signal: search=yes, ai-input=yes, ai-train=no",
    "Allow: /",
    "Disallow: /videos/",
    "Disallow: /admin",
    "Disallow: /api/",
    "Disallow: /account",
    "Disallow: /login",
    "Disallow: /search",
    "Disallow: /*?stats=",
    "Disallow: /*&stats=",
    "Disallow: /*?per=",
    "Disallow: /*&per=",
    "",
    `Sitemap: https://${apexHost}/sitemap.xml`,
    "",
  ].join("\n");
}

/**
 * Decide canonical URL and indexability for a GET response.
 * - Tracking params are ignored, so a shared link with `?utm_source=` canonicalises to the clean URL.
 * - Any other query (filters, `page`, `sort`) is a list variant: `noindex,follow`, and no canonical,
 *   so crawlers aren't handed contradictory signals.
 * - Non-200 responses, private paths and any host other than the apex (staging, *.workers.dev) are noindex.
 */
export function seoHead(url: URL, status: number, apexHost = "ftc-reference.com"): SeoHead {
  const variant = [...url.searchParams.keys()].some((k) => !TRACKING.test(k));
  const noindex = status !== 200 || variant || PRIVATE.test(url.pathname) || url.hostname !== apexHost;
  if (noindex) return { canonical: null, noindex: true };
  const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, "") : url.pathname;
  return { canonical: `${url.origin}${path}`, noindex: false };
}
