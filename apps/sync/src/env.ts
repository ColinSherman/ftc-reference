export interface Env {
  DB: D1Database;
  /** Raw API archive. Optional until R2 is enabled on the account. */
  RAW?: R2Bucket;
  CACHE_VER: KVNamespace;
  SYNC_QUEUE: Queue<SyncMessage>;
  FTC_API_USER: string;
  FTC_API_TOKEN: string;
  ADMIN_TOKEN: string;
  /** Optional: point at a mock server in local dev. */
  FTC_API_BASE?: string;
}

export type SyncMessage =
  | { job: "events"; season: number }
  | { job: "teams"; season: number; page: number }
  | { job: "eventMatches"; season: number; code: string; force?: boolean }
  | { job: "awards"; season: number; code: string; force?: boolean }
  | { job: "leagues"; season: number }
  | { job: "leagueMembers"; season: number; region: string; code: string }
  | { job: "avatars"; cmpYear: number }
  | { job: "avatarFetch"; cmpYear: number; refs: { team: number; key: string; path: string }[] };
