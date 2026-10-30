import "server-only";
import type { RateLimitInfo } from "@/lib/types";
import { log } from "@/lib/server/log";

const LIVE_API = "https://api.github.com";
const DEFAULT_TIMEOUT = 10_000;

/**
 * The API base can only be overridden in explicit test mode, which points the app
 * at the local fixture server. In normal use every request goes to api.github.com.
 */
export function isTestMode(): boolean {
  return process.env.CONTRIBLY_TEST_MODE === "1" && Boolean(process.env.GITHUB_API_URL);
}
const apiBase = () => (isTestMode() ? process.env.GITHUB_API_URL!.replace(/\/+$/, "") : LIVE_API);

export class GitHubError extends Error {
  constructor(
    message: string,
    readonly kind: "rate-limit" | "not-found" | "timeout" | "auth" | "validation" | "upstream" | "network",
    readonly status?: number,
    readonly resetAt?: string,
  ) {
    super(message);
    this.name = "GitHubError";
  }
}

type G = { __contriblyRate?: Map<string, RateLimitInfo> };
function rateStore(): Map<string, RateLimitInfo> {
  const g = globalThis as G;
  g.__contriblyRate ??= new Map();
  return g.__contriblyRate;
}

export function lastRateLimit(resource: string): RateLimitInfo | undefined {
  return rateStore().get(resource);
}

export function hasToken(): boolean {
  return Boolean(process.env.GITHUB_TOKEN?.trim());
}

function headers(accept = "application/vnd.github+json"): HeadersInit {
  const h: Record<string, string> = {
    Accept: accept,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "contribly",
  };
  const token = process.env.GITHUB_TOKEN?.trim();
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

function recordRate(res: Response): RateLimitInfo | undefined {
  const limit = res.headers.get("x-ratelimit-limit");
  const remaining = res.headers.get("x-ratelimit-remaining");
  const reset = res.headers.get("x-ratelimit-reset");
  const resource = res.headers.get("x-ratelimit-resource") ?? "core";
  if (limit == null || remaining == null || reset == null) return undefined;
  const info: RateLimitInfo = {
    resource,
    limit: Number(limit),
    remaining: Number(remaining),
    resetAt: new Date(Number(reset) * 1000).toISOString(),
  };
  rateStore().set(resource, info);
  return info;
}

/** Refuse to start a request when we already know the bucket is empty. */
function guard(resource: string): void {
  const r = rateStore().get(resource);
  if (r && r.remaining <= 0 && Date.parse(r.resetAt) > Date.now()) {
    throw new GitHubError(`GitHub ${resource} rate limit reached`, "rate-limit", 403, r.resetAt);
  }
}

/** Absolute URLs (e.g. from API responses) must stay on the configured API origin. */
function resolveUrl(path: string): string {
  const base = apiBase();
  if (!path.startsWith("http")) return base + path;
  if (new URL(path).origin !== new URL(base).origin) throw new GitHubError("Refused to follow a URL outside the GitHub API", "validation");
  return path;
}

export interface GhResponse<T> {
  data: T;
  status: number;
  link: string | null;
  rate?: RateLimitInfo;
}

export async function ghRest<T>(
  path: string,
  opts: { timeoutMs?: number; accept?: string; resource?: "core" | "search"; text?: boolean } = {},
): Promise<GhResponse<T>> {
  const resource = opts.resource ?? "core";
  guard(resource);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT);
  const started = Date.now();
  let res: Response;
  try {
    res = await fetch(resolveUrl(path), {
      headers: headers(opts.accept),
      signal: ctrl.signal,
      cache: "no-store",
    });
  } catch (err) {
    clearTimeout(timer);
    if ((err as Error).name === "AbortError") {
      throw new GitHubError("GitHub did not respond in time", "timeout");
    }
    log("warn", "github.network_error", { path, error: (err as Error).message });
    throw new GitHubError("Could not reach GitHub", "network");
  }
  clearTimeout(timer);
  const rate = recordRate(res);

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status !== 404) log("warn", "github.http_error", { path: path.split("?")[0], status: res.status, ms: Date.now() - started });
    if ((res.status === 403 || res.status === 429) && (rate?.remaining === 0 || /rate limit/i.test(body))) {
      throw new GitHubError("GitHub rate limit reached", "rate-limit", res.status, rate?.resetAt);
    }
    if (res.status === 404) throw new GitHubError("Not found on GitHub", "not-found", 404);
    if (res.status === 401) throw new GitHubError("GitHub token was rejected", "auth", 401);
    if (res.status === 422) throw new GitHubError("GitHub rejected the query", "validation", 422);
    throw new GitHubError(`GitHub returned ${res.status}`, "upstream", res.status);
  }

  const data = (opts.text ? await res.text() : await res.json()) as T;
  return { data, status: res.status, link: res.headers.get("link"), rate };
}

export async function ghGraphQL<T>(query: string, variables: Record<string, unknown>, timeoutMs = DEFAULT_TIMEOUT): Promise<T> {
  if (!hasToken()) throw new GitHubError("GraphQL needs a GitHub token", "auth");
  guard("graphql");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${apiBase()}/graphql`, {
      method: "POST",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
      signal: ctrl.signal,
      cache: "no-store",
    });
  } catch (err) {
    clearTimeout(timer);
    if ((err as Error).name === "AbortError") throw new GitHubError("GitHub did not respond in time", "timeout");
    throw new GitHubError("Could not reach GitHub", "network");
  }
  clearTimeout(timer);
  recordRate(res);
  if (!res.ok) {
    if (res.status === 401) throw new GitHubError("GitHub token was rejected", "auth", 401);
    throw new GitHubError(`GitHub GraphQL returned ${res.status}`, "upstream", res.status);
  }
  const json = (await res.json()) as { data?: T; errors?: { message: string; type?: string }[] };
  if (json.errors?.length) {
    const msg = json.errors[0]?.message ?? "GraphQL error";
    if (json.errors.some((e) => e.type === "RATE_LIMITED")) throw new GitHubError("GitHub rate limit reached", "rate-limit");
    if (!json.data) throw new GitHubError(msg, "upstream");
  }
  if (!json.data) throw new GitHubError("Empty GraphQL response", "upstream");
  return json.data;
}

export function errorMessage(err: unknown): string {
  if (err instanceof GitHubError) {
    if (err.kind === "rate-limit" && err.resetAt) {
      const mins = Math.max(1, Math.ceil((Date.parse(err.resetAt) - Date.now()) / 60_000));
      return `GitHub rate limit reached. Resets in about ${mins} min.`;
    }
    return err.message;
  }
  return "Unexpected error";
}

/** Parse the `last` page number out of a Link header. */
export function lastPageFromLink(link: string | null): number | null {
  if (!link) return null;
  const m = link.match(/[?&]page=(\d+)[^>]*>;\s*rel="last"/);
  return m ? Number(m[1]) : null;
}
