import type { AppContext } from "./env";

/**
 * Admins are signed-in users whose Google or GitHub account is listed in the account Worker's
 * ADMIN_ACCOUNTS. This Worker never reads sessions itself: it asks ftcref-account
 * (`/internal/whoami`) on each admin request, passing only the session cookie.
 */
/** The session cookie exactly as the browser sent it (it's signed, so it's passed on undecoded). */
const SESSION_COOKIE = /(?:^|;\s*)(ftcref\.session_token=[^;]+)/;

export type AdminUser = { handle: string };

/** The signed-in admin, or null (signed out, not an admin, or accounts unavailable). */
export async function adminUser(c: AppContext): Promise<AdminUser | null> {
  const cookie = SESSION_COOKIE.exec(c.req.header("cookie") ?? "")?.[1];
  if (!cookie || !c.env.ACCOUNT) return null;
  try {
    const res = await c.env.ACCOUNT.fetch("https://account/internal/whoami", { headers: { cookie } });
    if (!res.ok) return null;
    const who = await res.json<{ handle: string; admin: boolean }>();
    return who.admin ? { handle: who.handle } : null;
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
