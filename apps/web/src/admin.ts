import { getCookie, setCookie } from "hono/cookie";
import type { AppContext } from "./env";

/**
 * Minimal admin session: POST the ADMIN_TOKEN once, get an HttpOnly cookie holding an HMAC of a
 * fixed label (so the token itself never sits in the browser). SameSite=Strict blocks CSRF.
 */
const COOKIE = "ftcref_admin";

async function hmac(secret: string, msg: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export async function isAdmin(c: AppContext) {
  const token = c.env.ADMIN_TOKEN;
  const got = getCookie(c, COOKIE);
  if (!token || !got) return false;
  return safeEqual(got, await hmac(token, "ftcref-admin-v1"));
}

export async function logIn(c: AppContext, submitted: string) {
  const token = c.env.ADMIN_TOKEN;
  if (!token || !safeEqual(submitted, token)) return false;
  setCookie(c, COOKIE, await hmac(token, "ftcref-admin-v1"), {
    httpOnly: true,
    secure: true,
    sameSite: "Strict",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return true;
}

export function logOut(c: AppContext) {
  setCookie(c, COOKIE, "", { path: "/", maxAge: 0, secure: true, httpOnly: true, sameSite: "Strict" });
}
