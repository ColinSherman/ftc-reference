/**
 * Robot photos are hotlinked from Imgur (like The Blue Alliance's `imgur` media type): we store only
 * the image id and build size-suffixed URLs. Albums (/a/…) and galleries can't be hotlinked, so they're rejected.
 */
const IMGUR_ID = /^[A-Za-z0-9]{5,8}$/;

/** Image id from an Imgur page/direct link or a bare id; null if it isn't a single image. */
export function parseImgur(input: string): string | null {
  const s = input.trim();
  if (IMGUR_ID.test(s)) return s;
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return null;
  }
  if (!/^(i\.|m\.)?imgur\.com$/i.test(u.hostname)) return null;
  const parts = u.pathname.split("/").filter(Boolean);
  if (parts.length !== 1) return null; // /a/x, /gallery/x, /user/…
  const id = (parts[0] as string).replace(/\.(jpe?g|png|webp|gif)$/i, "");
  return IMGUR_ID.test(id) ? id : null;
}

/** Imgur size suffixes: t = 160px thumb, m = 320px, l = 640px; none = original. */
export const imgurUrl = (ref: string, size: "t" | "m" | "l" | "" = "") =>
  `https://i.imgur.com/${ref}${size}.jpg`;
