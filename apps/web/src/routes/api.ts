import { Hono } from "hono";
import type { Env } from "../env";

/**
 * The public API, `/api/v1/*`. Every request needs `Authorization: Bearer ftcr_…`; the
 * ftcref-account Worker checks the key (and its per-key rate limit) over the ACCOUNT binding, so this
 * Worker never reads the accounts DB. Only `me` exists so far, to prove the plumbing; data endpoints
 * come later.
 */
type ApiKeyOwner = { keyId: string; keyName: string; userId: string; handle: string };
export const apiRoutes = new Hono<{ Bindings: Env; Variables: { owner: ApiKeyOwner } }>();

const PRIVATE = { "Cache-Control": "private, no-store" };
const CHALLENGE = { "WWW-Authenticate": 'Bearer realm="ftc-reference"' };

apiRoutes.use("/api/v1/*", async (c, next) => {
  const authorization = c.req.header("authorization");
  if (!authorization?.startsWith("Bearer "))
    return c.json(
      { error: "missing_key", message: "Send your API key as `Authorization: Bearer ftcr_…`." },
      401,
      { ...PRIVATE, ...CHALLENGE },
    );
  if (!c.env.ACCOUNT) return c.json({ error: "unavailable" }, 503, PRIVATE);
  let res: Response;
  try {
    res = await c.env.ACCOUNT.fetch("https://account/internal/verify-key", { headers: { authorization } });
  } catch {
    return c.json({ error: "unavailable" }, 503, PRIVATE);
  }
  if (res.status === 401)
    return c.json({ error: "invalid_key", message: "That key is unknown, revoked or expired." }, 401, {
      ...PRIVATE,
      ...CHALLENGE,
    });
  if (res.status === 429)
    return c.json(
      { error: "rate_limited", message: "Too many requests for this key. Try again in a minute." },
      429,
      {
        ...PRIVATE,
        "Retry-After": "60",
      },
    );
  if (!res.ok) return c.json({ error: "unavailable" }, 503, PRIVATE);
  c.set("owner", await res.json<ApiKeyOwner>());
  await next();
  c.res.headers.set("Cache-Control", PRIVATE["Cache-Control"]);
});

apiRoutes.get("/api/v1/me", (c) => {
  const { handle, keyName } = c.var.owner;
  return c.json({ handle, key: keyName });
});

apiRoutes.all("/api/v1/*", (c) => c.json({ error: "not_found" }, 404));
