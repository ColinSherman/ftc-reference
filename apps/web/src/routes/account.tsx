import { Hono } from "hono";
import type { Child } from "hono/jsx";
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

/** Provider marks as their brand guidelines draw them (Google's four-color G, GitHub's Invertocat). */
const PROVIDER_LOGO: Record<Provider, Child> = {
  google: (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  ),
  github: (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"
      />
    </svg>
  ),
};

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
                <button type="submit" class={`sso sso-${p}`}>
                  {PROVIDER_LOGO[p]}
                  Continue with {PROVIDER_NAME[p]}
                </button>
              </form>
            ))}
            {who.dev && (
              <form method="post" action="/api/account/dev-sign-in">
                <button type="submit" class="sso sso-dev">
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
