export interface Env {
  DB: D1Database;
  /** Raw API archive. Optional until R2 is enabled on the account. */
  RAW?: R2Bucket;
  CACHE_VER: KVNamespace;
  SYNC_QUEUE: Queue<SyncMessage>;
  /** Throttled queue for historical backfills, so live polling never waits behind them. */
  BACKFILL_QUEUE: Queue<SyncMessage>;
  FTC_API_USER: string;
  FTC_API_TOKEN: string;
  ADMIN_TOKEN: string;
  /** YouTube Data API key (match video scanning). Optional: scanning is skipped without it. */
  YOUTUBE_API_KEY?: string;
  /** Optional: point at a mock server in local dev. */
  FTC_API_BASE?: string;
}

export type SyncMessage =
  | { job: "events"; season: number }
  | { job: "teams"; season: number; page: number; force?: boolean }
  | { job: "eventMatches"; season: number; code: string; force?: boolean }
  | { job: "awards"; season: number; code: string; force?: boolean }
  | { job: "leagues"; season: number }
  | { job: "leagueMembers"; season: number; region: string; code: string }
  | { job: "avatars"; cmpYear: number }
  | { job: "videoScan" }
  | { job: "streamAlign" }
  | { job: "avatarFetch"; cmpYear: number; refs: { team: number; key: string; path: string }[] };
