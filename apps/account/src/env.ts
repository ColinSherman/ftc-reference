export interface Env {
  /** Accounts only (ftcref-auth / ftcref-stage-auth). Never bound to the web or sync Workers. */
  AUTH_DB: D1Database;
  /** The public site origin; requests reach this Worker through ftcref-web's ACCOUNT binding. */
  AUTH_URL: string;
  /** "production" | "staging" | "local" (`pnpm dev:account` sets local). */
  ENV_NAME: string;
  /** Per-IP limit on sign-in and account writes. Keys are never stored. */
  AUTH_LIMIT?: RateLimit;
  /** Per-key limit on API requests. */
  KEY_LIMIT?: RateLimit;
  BETTER_AUTH_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
}
