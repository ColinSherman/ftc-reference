import { Hono } from "hono";
import type { AppContext, Env } from "../env";
import { Layout } from "../views/layout";

/**
 * Sign-in and account pages. Sessions and user data belong to the ftcref-account Worker (ACCOUNT
 * binding); this Worker never reads them itself. It forwards `/api/auth/*` and `/api/account/*`
 * there and renders the two pages below from its answers. None of this goes through `cached()`:
 * every response here is private, and public pages stay identical for every visitor.
 */
export const accountRoutes = new Hono<{ Bindings: Env }>();

const PRIVATE = { "Cache-Control": "private, no-store" };

type Provider = "google" | "github";
type Me = {
  user: { handle: string; createdAt: string; linked: string[] } | null;
  providers: Provider[];
  dev: boolean;
};

/** `credential` is the local-only dev sign-in. */
const PROVIDER_NAME: Record<string, string> = {
  google: "Google",
  github: "GitHub",
  credential: "dev sign-in",
};

/** Forward to ftcref-account, or a 503 when it isn't bound or running (e.g. no `pnpm dev:account`). */
async function toAccount(c: AppContext, req: Request): Promise<Response> {
  if (!c.env.ACCOUNT) return new Response("Accounts are not available.", { status: 503, headers: PRIVATE });
  try {
    return await c.env.ACCOUNT.fetch(req);
  } catch {
    return new Response("Accounts are not available.", { status: 503, headers: PRIVATE });
  }
}

accountRoutes.all("/api/auth/*", (c) => toAccount(c, c.req.raw));
accountRoutes.all("/api/account/*", (c) => toAccount(c, c.req.raw));

/** Who's signed in, per the account Worker. null = accounts unavailable here. */
async function me(c: AppContext): Promise<Me | null> {
  const headers = new Headers();
  const cookie = c.req.header("cookie");
  if (cookie) headers.set("cookie", cookie);
  const res = await toAccount(c, new Request(new URL("/api/account/me", c.req.url), { headers }));
  if (res.status !== 200 && res.status !== 401) return null;
  return (await res.json()) as Me;
}

const LOGIN_ERRORS: Record<string, string> = {
  reauth: "For your security, sign in again to delete your account.",
};

accountRoutes.get("/login", async (c) => {
  const who = await me(c);
  if (who?.user) return c.redirect("/account", 303);
  const error = c.req.query("error");
  const deleted = c.req.query("deleted") !== undefined;
  return c.html(
    <Layout title="Sign in" description="Sign in to FTC-Reference.">
      <div class="prose">
        <h1>Sign in</h1>
        {deleted && <p class="ok">Your account and everything in it have been deleted.</p>}
        {error && <p class="err">{LOGIN_ERRORS[error] ?? "Sign-in didn't finish. Please try again."}</p>}
        {!who || (!who.providers.length && !who.dev) ? (
          <p>Sign-in isn't available right now. Everything on the site works without an account.</p>
        ) : (
          <div class="signin">
            {who.providers.map((p) => (
              <form method="post" action={`/api/account/sign-in/${p}`}>
                <button type="submit" class="go">
                  Continue with {PROVIDER_NAME[p]}
                </button>
              </form>
            ))}
            {who.dev && (
              <form method="post" action="/api/account/dev-sign-in">
                <button type="submit" class="go">
                  Dev sign-in (local only)
                </button>
              </form>
            )}
          </div>
        )}
        <p>
          You don't need an account to use the site. Accounts are for upcoming features such as API keys, and
          you must be <b>13 or older</b> to make one.
        </p>
        <p class="note">
          We store only which service you signed in with, the ID it gives us for you, and a handle you can
          change. We don't ask for or keep your email, name or photo. See the{" "}
          <a href="/privacy">privacy policy</a>.
        </p>
      </div>
    </Layout>,
    200,
    PRIVATE,
  );
});

const ACCOUNT_ERRORS: Record<string, string> = {
  handle: "Handles are 3–24 letters, numbers, - or _.",
  confirm: 'Type "delete" in the box to delete your account.',
};

accountRoutes.get("/account", async (c) => {
  const who = await me(c);
  if (!who?.user) return c.redirect("/login", 303);
  const { user } = who;
  const error = c.req.query("error");
  return c.html(
    <Layout title="Account" description="Your FTC-Reference account.">
      <div class="prose">
        <h1>Account</h1>
        {c.req.query("saved") !== undefined && <p class="ok">Saved.</p>}
        {error && <p class="err">{ACCOUNT_ERRORS[error] ?? "That didn't work. Please try again."}</p>}
        <p>
          Signed in with {user.linked.map((p) => PROVIDER_NAME[p] ?? p).join(", ")} since{" "}
          {user.createdAt.slice(0, 10)}.
        </p>

        <h2>Handle</h2>
        <form method="post" action="/api/account/handle" class="filters">
          <label>
            Shown only to you for now
            <input
              name="handle"
              value={user.handle}
              required
              minlength={3}
              maxlength={24}
              pattern="[A-Za-z0-9_\-]+"
            />
          </label>
          <button type="submit" class="go">
            Save
          </button>
        </form>

        <h2>Sign out</h2>
        <form method="post" action="/api/account/sign-out">
          <button type="submit" class="go">
            Sign out
          </button>
        </form>

        <h2>Delete account</h2>
        <p>
          This deletes your account and its sign-in links right away. It can't be undone. You can make a new
          account later.
        </p>
        <form method="post" action="/api/account/delete" class="filters">
          <label>
            Type "delete" to confirm
            <input name="confirm" required autocomplete="off" />
          </label>
          <button type="submit" class="go">
            Delete my account
          </button>
        </form>
      </div>
    </Layout>,
    200,
    PRIVATE,
  );
});
