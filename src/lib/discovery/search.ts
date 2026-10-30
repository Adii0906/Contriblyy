import "server-only";
import type { DiscoverResponse, IssueSummary, ScopePreference, SkillSelection } from "@/lib/types";
import { ghRest, errorMessage, lastRateLimit, GitHubError } from "@/lib/github/client";
import { namedCache } from "@/lib/server/cache";
import { log } from "@/lib/server/log";
import { buildQueries, type SearchQuery } from "./query";
import { mergeIssues, normalizeIssue, type RawSearchIssue } from "./normalize";

const PER_PAGE = 30;
const SEARCH_TTL = 10 * 60_000;

interface QueryResult {
  issues: IssueSummary[];
  total: number;
}

const searchCache = namedCache<QueryResult>("search", 500);

async function runQuery(sq: SearchQuery, page: number): Promise<QueryResult> {
  const params = new URLSearchParams({ q: sq.q, sort: "updated", order: "desc", per_page: String(PER_PAGE), page: String(page) });
  const res = await ghRest<{ total_count: number; items: RawSearchIssue[] }>(`/search/issues?${params}`, {
    resource: "search",
    timeoutMs: 12_000,
  });
  const issues = res.data.items
    .map((raw) => normalizeIssue(raw, sq.skillIds))
    .filter((i): i is IssueSummary => i !== null);
  return { issues, total: res.data.total_count };
}

export async function discover(input: {
  skills: SkillSelection[];
  scope: ScopePreference;
  keywords?: string;
  page: number;
}): Promise<DiscoverResponse> {
  const queries = buildQueries(input.skills, { scope: input.scope, keywords: input.keywords, now: new Date() });
  // Query strings embed a date (updated:>=), so cache keys roll over daily.
  let allCached = true;
  const settled = await Promise.allSettled(
    queries.map(async (sq) => {
      const r = await searchCache.getOrLoad(`${sq.q}|p${input.page}`, SEARCH_TTL, () => runQuery(sq, input.page));
      if (!r.cached) allCached = false;
      return r.value;
    }),
  );

  const queryReport: DiscoverResponse["queries"] = [];
  const lists: IssueSummary[][] = [];
  let hasMore = false;
  let rateLimited = false;
  settled.forEach((s, i) => {
    const sq = queries[i]!;
    if (s.status === "fulfilled") {
      lists.push(s.value.issues);
      queryReport.push({ skillId: sq.skillId, query: sq.q, ok: true, total: s.value.total });
      if (s.value.total > input.page * PER_PAGE && input.page * PER_PAGE < 1000) hasMore = true;
    } else {
      const err = s.reason;
      if (err instanceof GitHubError && err.kind === "rate-limit") rateLimited = true;
      queryReport.push({ skillId: sq.skillId, query: sq.q, ok: false, error: errorMessage(err) });
    }
  });

  const failed = queryReport.filter((q) => !q.ok).length;
  log(failed ? "warn" : "info", "discover", { queries: queries.length, failed, page: input.page, rateLimited });

  if (failed === queries.length && queries.length > 0) {
    const first = settled.find((s) => s.status === "rejected") as PromiseRejectedResult | undefined;
    throw first?.reason ?? new Error("All searches failed");
  }

  return {
    issues: mergeIssues(lists),
    queries: queryReport,
    page: input.page,
    hasMore,
    partial: failed > 0,
    fetchedAt: new Date().toISOString(),
    cached: allCached,
    rateLimit: lastRateLimit("search"),
  };
}
