export const FTC_API_BASE = "https://ftc-api.firstinspires.org/v2.0";

export type FetchResult<T> =
  | { status: "not_modified" }
  /** `data` is null when the API answered with an empty body / HTML "no data" page. */
  | { status: "ok"; data: T | null; lastModified: string | null; body: string };

export class FtcApiError extends Error {
  constructor(
    readonly httpStatus: number,
    readonly path: string,
    message: string,
  ) {
    super(`FTC API ${httpStatus} on ${path}: ${message}`);
  }
}

export interface FtcApiOptions {
  user: string;
  token: string;
  fetch?: typeof fetch;
  /** Override for local mocks; defaults to the official API. */
  baseUrl?: string;
  /** Max attempts for 429 / 5xx / network errors. */
  attempts?: number;
  baseDelayMs?: number;
}

export class FtcApi {
  private readonly auth: string;
  private readonly fetchImpl: typeof fetch;
  private readonly attempts: number;
  private readonly baseDelayMs: number;
  private readonly baseUrl: string;
  /** Requests issued (including retries) — surfaced in sync_runs. */
  requests = 0;
  notModified = 0;

  constructor(opts: FtcApiOptions) {
    this.auth = `Basic ${btoa(`${opts.user}:${opts.token}`)}`;
    this.fetchImpl = opts.fetch ?? fetch.bind(globalThis);
    this.attempts = opts.attempts ?? 3;
    this.baseDelayMs = opts.baseDelayMs ?? 500;
    this.baseUrl = opts.baseUrl ?? FTC_API_BASE;
  }

  /**
   * GET `/{season}/{path}`. Pass the previously seen `Last-Modified` value as `ifModifiedSince`
   * to get a cheap 304 when nothing changed.
   */
  async get<T>(season: number, path: string, ifModifiedSince?: string | null): Promise<FetchResult<T>> {
    const url = `${this.baseUrl}/${season}/${path}`;
    const headers: Record<string, string> = { Authorization: this.auth, Accept: "application/json" };
    if (ifModifiedSince) headers["If-Modified-Since"] = ifModifiedSince;

    let lastErr: unknown;
    for (let attempt = 0; attempt < this.attempts; attempt++) {
      if (attempt > 0) await sleep(this.baseDelayMs * 2 ** (attempt - 1));
      this.requests++;
      let res: Response;
      try {
        res = await this.fetchImpl(url, { headers });
      } catch (e) {
        lastErr = e;
        continue;
      }

      if (res.status === 304) {
        this.notModified++;
        return { status: "not_modified" };
      }
      if (res.status === 429 || res.status >= 500) {
        lastErr = new FtcApiError(res.status, path, await safeText(res));
        continue;
      }
      if (!res.ok) throw new FtcApiError(res.status, path, await safeText(res));

      const body = await res.text();
      const lastModified = res.headers.get("Last-Modified");
      return {
        status: "ok",
        data: parseJsonBody<T>(body, res.headers.get("Content-Type")),
        lastModified,
        body,
      };
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  }
}

/** The API sometimes returns an HTML page (or nothing) instead of JSON when there is no data. */
export function parseJsonBody<T>(body: string, contentType: string | null): T | null {
  const trimmed = body.trimStart();
  if (!trimmed) return null;
  if (contentType?.includes("text/html") || trimmed.startsWith("<")) return null;
  return JSON.parse(trimmed) as T;
}

async function safeText(res: Response) {
  try {
    return (await res.text()).slice(0, 300);
  } catch {
    return "";
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
