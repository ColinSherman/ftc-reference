import { type BetterAuthOptions, betterAuth } from "better-auth";
import type { Env } from "./env";

/**
 * Better Auth, configured to store as little as possible (many users are minors). An account holds
 * the provider, the provider's user id and a handle: no real email, name, avatar, provider tokens,
 * IP address or user agent. docs/auth-plan.md has the reasoning and the spike that checked it.
 */

/** Local dev only: a fixed secret and password so `pnpm dev:account` needs no setup. Never deployed. */
const LOCAL_SECRET = "local-dev-only-secret-not-used-in-any-deployment";
export const DEV_USER = { email: "dev@users.invalid", password: "local-dev-password", name: "dev" };

export const isLocal = (env: Pick<Env, "ENV_NAME">) => env.ENV_NAME === "local";

/** Never deliverable (RFC 6761 `.invalid`), but unique per provider account, as Better Auth requires. */
const placeholderEmail = (provider: string, id: string | number) => `${provider}-${id}@users.invalid`;

export function authOptions(env: Env, database: BetterAuthOptions["database"]): BetterAuthOptions | null {
  const secret = env.BETTER_AUTH_SECRET ?? (isLocal(env) ? LOCAL_SECRET : undefined);
  if (!secret) return null;

  const socialProviders: BetterAuthOptions["socialProviders"] = {};
  if (env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET) {
    socialProviders.github = {
      clientId: env.GITHUB_CLIENT_ID,
      clientSecret: env.GITHUB_CLIENT_SECRET,
      // Public profile only: no user:email, so GitHub never sends us a private address.
      disableDefaultScope: true,
      scope: ["read:user"],
      mapProfileToUser: (p) => ({
        name: p.login,
        email: placeholderEmail("github", p.id),
        emailVerified: false,
        image: undefined,
      }),
    };
  }
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    socialProviders.google = {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      // `openid` alone: the id token carries only `sub`, no email or name.
      disableDefaultScope: true,
      scope: ["openid"],
      prompt: "select_account",
      mapProfileToUser: (p) => ({
        name: `user-${p.sub.slice(-6)}`,
        email: placeholderEmail("google", p.sub),
        emailVerified: false,
        image: undefined,
      }),
    };
  }

  return {
    baseURL: env.AUTH_URL,
    secret,
    trustedOrigins: [env.AUTH_URL],
    database,
    socialProviders,
    // Local dev sign-in only (see DEV_USER); staging and production are social-only.
    emailAndPassword: { enabled: isLocal(env) },
    // Off by default; pinned so an env var can't turn it on.
    telemetry: { enabled: false },
    // Emails are placeholders, so never link accounts by email.
    account: { accountLinking: { enabled: false, disableImplicitLinking: true } },
    user: { deleteUser: { enabled: true } },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
    onAPIError: { errorURL: `${env.AUTH_URL}/login` },
    // Rate limiting is the AUTH_LIMIT binding (index.ts): with IP tracking off, Better Auth's own is off.
    rateLimit: { enabled: false },
    advanced: {
      cookiePrefix: "ftcref",
      ipAddress: { disableIpTracking: true },
    },
    databaseHooks: {
      // We never call provider APIs after sign-in, so don't keep their tokens.
      account: {
        create: { before: async (a) => ({ data: stripTokens(a) }) },
        update: { before: async (a) => ({ data: stripTokens(a) }) },
      },
      session: {
        create: { before: async (s) => ({ data: { ...s, ipAddress: null, userAgent: null } }) },
      },
    },
  };
}

function stripTokens<T extends Record<string, unknown>>(a: T): T {
  return {
    ...a,
    accessToken: null,
    refreshToken: null,
    idToken: null,
    accessTokenExpiresAt: null,
    refreshTokenExpiresAt: null,
  };
}

export type Auth = ReturnType<typeof betterAuth>;

/** One instance per env object (one per isolate in production); null when accounts aren't configured. */
const instances = new WeakMap<object, Auth | null>();
export function authFor(env: Env): Auth | null {
  let auth = instances.get(env);
  if (auth === undefined) {
    const options = authOptions(env, env.AUTH_DB);
    auth = options ? betterAuth(options) : null;
    instances.set(env, auth);
  }
  return auth;
}

/**
 * Whether a user with these sign-ins is an admin: one of them is listed in ADMIN_ACCOUNTS. Locally
 * the dev sign-in user is an admin too, so /admin works with no setup.
 */
export function isAdminAccount(env: Env, accounts: { providerId: string; accountId: string }[]) {
  if (isLocal(env) && accounts.some((a) => a.providerId === "credential")) return true;
  const admins = new Set(
    (env.ADMIN_ACCOUNTS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
  return accounts.some((a) => admins.has(`${a.providerId}:${a.accountId}`));
}

/** Providers that have credentials in this environment, in display order. */
export const providers = (env: Env) =>
  [
    env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET ? "google" : null,
    env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET ? "github" : null,
  ].filter((p): p is "google" | "github" => p !== null);
