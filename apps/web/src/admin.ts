import type { AppContext } from "./env";

/**
 * Admins are signed-in users whose Google or GitHub account is listed in the account Worker's
 * ADMIN_ACCOUNTS. This Worker never reads sessions itself: it asks ftcref-account
 * (`/internal/whoami`) on each admin request, passing only the session cookie.
 */
/**
 * The session cookie exactly as the browser sent it (it's signed, so it's passed on undecoded). Over
 * HTTPS (staging, production) Better Auth names it `__Secure-ftcref.session_token`; locally, plain.
 */
const SESSION_COOKIE = /(?:^|;\s*)((?:__Secure-)?ftcref\.session_token=[^;]+)/;

export type AdminUser = { handle: string };
export type SignedInUser = { handle: string; admin: boolean };

const sessionCookie = (c: AppContext) => SESSION_COOKIE.exec(c.req.header("cookie") ?? "")?.[1];

/** Whether the browser sent a session cookie at all. Free (no subrequest); not proof of a session. */
export const hasSessionCookie = (c: AppContext) => sessionCookie(c) !== undefined;

/** The signed-in user, or null (signed out, or accounts unavailable). One subrequest to ftcref-account. */
export async function signedInUser(c: AppContext): Promise<SignedInUser | null> {
  const cookie = sessionCookie(c);
  if (!cookie || !c.env.ACCOUNT) return null;
  try {
    const res = await c.env.ACCOUNT.fetch("https://account/internal/whoami", { headers: { cookie } });
    if (!res.ok) return null;
    const who = await res.json<SignedInUser>();
    return { handle: who.handle, admin: who.admin === true };
  } catch {
    return null;
  }
}

/** The signed-in admin, or null (signed out, not an admin, or accounts unavailable). */
export async function adminUser(c: AppContext): Promise<AdminUser | null> {
  const who = await signedInUser(c);
  return who?.admin ? { handle: who.handle } : null;
}

export type AccountStats = {
  users: number;
  new7: number;
  active1: number;
  active7: number;
  active30: number;
  keys: number;
};

/** Account counts from ftcref-account; it answers only for an admin's session cookie. */
export async function accountStats(c: AppContext): Promise<AccountStats | null> {
  const cookie = sessionCookie(c);
  if (!cookie || !c.env.ACCOUNT) return null;
  try {
    const res = await c.env.ACCOUNT.fetch("https://account/internal/stats", { headers: { cookie } });
    return res.ok ? await res.json<AccountStats>() : null;
  } catch {
    return null;
  }
}

export const isAdmin = async (c: AppContext) => (await adminUser(c)) !== null;

/**
 * Admin form posts must come from the site. The session cookie is SameSite=Lax, which already keeps
 * it off cross-site POSTs; this checks again, the same way the account Worker does.
 */
export function sameSitePost(headers: Headers, siteOrigin: string) {
  const site = headers.get("sec-fetch-site");
  if (site) return site === "same-origin";
  return headers.get("origin") === siteOrigin;
}
