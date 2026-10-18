import { getCookie } from "hono/cookie";
import type { AppContext } from "./env";

/** Choices in the "per page" dropdown. The cookie stores one of these. */
export const PAGE_SIZES = [50, 100, 250, 500] as const;

export const DEFAULT_PAGE_SIZE = 100;

export function pageSizeOf(raw: string | undefined | null): number | null {
  const n = Number(raw);
  return (PAGE_SIZES as readonly number[]).includes(n) ? n : null;
}

export function chosenPageSize(cookie: string | undefined): number {
  return pageSizeOf(cookie) ?? DEFAULT_PAGE_SIZE;
}

/** Page size comes from the cookie. `page` stays in the URL so a link can be shared. */
export function listWindow(c: AppContext): { size: number; page: number } {
  const size = chosenPageSize(getCookie(c, "per"));
  const raw = Number(c.req.query("page"));
  const page = Number.isInteger(raw) && raw > 0 ? raw : 1;
  return { size, page };
}

export function slicePage<T>(rows: T[], page: number, size: number) {
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / size));
  const p = Math.min(Math.max(page, 1), pages);
  const start = (p - 1) * size;
  return { page: p, pages, start, size, total, rows: rows.slice(start, start + size) };
}
