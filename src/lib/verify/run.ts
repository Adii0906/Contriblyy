import "server-only";
import type {
  AssignmentData,
  CheckKey,
  CheckRun,
  ClaimsData,
  MaintainerData,
  PolicyData,
  PrData,
  RepoData,
  Verification,
  VerificationChecks,
} from "@/lib/types";
import { ghGraphQL, ghRest, errorMessage, hasToken, lastPageFromLink, GitHubError } from "@/lib/github/client";
import { namedCache } from "@/lib/server/cache";
import { log } from "@/lib/server/log";
import { detectClaims, type CommentInput } from "./claims";
import { buildPrData, parseGraphqlPrs, parseRestTimeline, PR_GRAPHQL, type GqlIssuePrs, type RestTimelineEvent } from "./prs";
import { assessMaintainers, assessRepo, type RepoCommentInput, type RepoInput } from "./health";
import { scanPolicies, type PolicyDoc } from "./policy";
import { assess } from "./assess";

const MIN = 60_000;
const verificationCache = namedCache<Verification>("verification", 3000);
const repoCache = namedCache<RepoInput>("repo", 1500);
const repoCommentsCache = namedCache<RepoCommentInput[]>("repo-comments", 1500);
const policyCache = namedCache<PolicyDoc[]>("policy", 1500);

const ISSUE_TTL = 15 * MIN;
const REPO_TTL = 60 * MIN;
const POLICY_TTL = 6 * 60 * MIN;

/* ---------------- raw payload shapes ---------------- */

interface RawIssue {
  state: "open" | "closed";
  assignees: { login: string }[] | null;
  locked: boolean;
  comments: number;
  pull_request?: unknown;
}
interface RawComment {
  id: number;
  body: string | null;
  created_at: string;
  html_url: string;
  author_association: string;
  user: { login: string; type?: string } | null;
}
interface RawRepo {
  archived: boolean;
  disabled: boolean;
  language: string | null;
  topics?: string[];
  stargazers_count: number;
  pushed_at: string | null;
  default_branch: string;
  html_url: string;
}
interface RawCommit {
  commit: { committer: { date: string } | null; author: { date: string } | null };
}
interface RawPull {
  merged_at: string | null;
}
interface RawContent {
  content?: string;
  encoding?: string;
  html_url: string;
  name: string;
  path: string;
}

/* ---------------- fetchers ---------------- */

const base = (owner: string, repo: string) => `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;

async function fetchIssueComments(owner: string, repo: string, number: number, total: number): Promise<{ comments: CommentInput[]; scanned: number }> {
  if (total === 0) return { comments: [], scanned: 0 };
  const path = `${base(owner, repo)}/issues/${number}/comments?per_page=100`;
  const first = await ghRest<RawComment[]>(path);
  let raws = first.data;
  const last = lastPageFromLink(first.link);
  if (last && last > 1) {
    // Claims usually live near the end, so read the newest page too.
    const tail = await ghRest<RawComment[]>(`${path}&page=${last}`);
    raws = [...raws, ...tail.data];
  }
  const comments = raws.map((c) => ({
    id: c.id,
    author: c.user?.login ?? "ghost",
    association: c.author_association,
    body: c.body ?? "",
    createdAt: c.created_at,
    url: c.html_url,
    isBot: c.user?.type === "Bot",
  }));
  return { comments, scanned: comments.length };
}

async function fetchPrs(owner: string, repo: string, number: number): Promise<CheckRun<PrData>> {
  if (hasToken()) {
    try {
      const data = await ghGraphQL<GqlIssuePrs>(PR_GRAPHQL, { owner, name: repo, number });
      const parsed = parseGraphqlPrs(data);
      if (parsed) return { status: "ok", data: buildPrData(parsed.prs, "graphql", parsed.complete) };
    } catch (err) {
      if (err instanceof GitHubError && err.kind === "rate-limit") throw err;
      log("warn", "verify.graphql_fallback", { owner, repo, number, error: (err as Error).message });
    }
  }
  const path = `${base(owner, repo)}/issues/${number}/timeline?per_page=100`;
  const first = await ghRest<RestTimelineEvent[]>(path);
  let events = first.data;
  const last = lastPageFromLink(first.link);
  if (last && last > 1) events = [...events, ...(await ghRest<RestTimelineEvent[]>(`${path}&page=${last}`)).data];
  const prs = parseRestTimeline(events, number, `${owner}/${repo}`);
  return { status: "ok", data: buildPrData(prs, "rest-timeline", !last || last <= 2) };
}

async function loadRepo(owner: string, repo: string): Promise<RepoInput> {
  const meta = (await ghRest<RawRepo>(base(owner, repo))).data;
  const since = new Date(Date.now() - 90 * 86_400_000).toISOString();
  const [commitsR, pullsR] = await Promise.allSettled([
    ghRest<RawCommit[]>(`${base(owner, repo)}/commits?since=${since}&per_page=100`),
    ghRest<RawPull[]>(`${base(owner, repo)}/pulls?state=closed&sort=updated&direction=desc&per_page=50`),
  ]);

  let commits90: number | null = null;
  let commitsCapped = false;
  let lastCommitAt: string | null = null;
  if (commitsR.status === "fulfilled") {
    commits90 = commitsR.value.data.length;
    commitsCapped = Boolean(lastPageFromLink(commitsR.value.link));
    const c = commitsR.value.data[0]?.commit;
    lastCommitAt = c?.committer?.date ?? c?.author?.date ?? null;
    if (!lastCommitAt) {
      try {
        const latest = await ghRest<RawCommit[]>(`${base(owner, repo)}/commits?per_page=1`);
        const lc = latest.data[0]?.commit;
        lastCommitAt = lc?.committer?.date ?? lc?.author?.date ?? null;
      } catch {
        /* empty repository or no access; leave null */
      }
    }
  } else if (commitsR.reason instanceof GitHubError && commitsR.reason.status === 409) {
    commits90 = 0; // empty repository
  }

  let merged90: number | null = null;
  let lastMergedAt: string | null = null;
  if (pullsR.status === "fulfilled") {
    const cutoff = Date.now() - 90 * 86_400_000;
    const merged = pullsR.value.data.map((p) => p.merged_at).filter((d): d is string => Boolean(d)).sort();
    merged90 = merged.filter((d) => Date.parse(d) >= cutoff).length;
    lastMergedAt = merged.at(-1) ?? null;
  }

  return {
    archived: meta.archived,
    disabled: meta.disabled,
    language: meta.language,
    topics: meta.topics ?? [],
    stars: meta.stargazers_count,
    pushedAt: meta.pushed_at,
    commits90,
    commitsCapped,
    lastCommitAt,
    merged90,
    lastMergedAt,
  };
}

async function loadRepoComments(owner: string, repo: string): Promise<RepoCommentInput[]> {
  const res = await ghRest<RawComment[]>(`${base(owner, repo)}/issues/comments?sort=created&direction=desc&per_page=100`);
  return res.data.map((c) => ({
    author: c.user?.login ?? "ghost",
    association: c.author_association,
    createdAt: c.created_at,
    isBot: c.user?.type === "Bot",
  }));
}

function decode(c: RawContent): string {
  if (!c.content) return "";
  return Buffer.from(c.content, (c.encoding as BufferEncoding) || "base64").toString("utf8").slice(0, 200_000);
}

async function loadPolicyDocs(owner: string, repo: string): Promise<PolicyDoc[]> {
  const docs: PolicyDoc[] = [];
  const tryContent = async (path: string, name?: string) => {
    try {
      const r = await ghRest<RawContent>(path);
      docs.push({ name: name ?? r.data.path, url: r.data.html_url, text: decode(r.data) });
      return true;
    } catch (err) {
      if (err instanceof GitHubError && err.kind === "not-found") return false;
      throw err;
    }
  };

  await tryContent(`${base(owner, repo)}/readme`, "README");

  let contributingFound = false;
  try {
    const profile = await ghRest<{ files?: { contributing?: { url: string } | null } }>(`${base(owner, repo)}/community/profile`);
    const url = profile.data.files?.contributing?.url;
    if (url) contributingFound = await tryContent(url, "CONTRIBUTING");
  } catch (err) {
    if (err instanceof GitHubError && err.kind === "rate-limit") throw err;
  }
  if (!contributingFound) {
    for (const p of ["CONTRIBUTING.md", ".github/CONTRIBUTING.md", "docs/CONTRIBUTING.md"]) {
      if (await tryContent(`${base(owner, repo)}/contents/${p}`, "CONTRIBUTING")) break;
    }
  }
  // Some projects keep a dedicated AI policy file.
  for (const p of ["AI_POLICY.md", ".github/AI_POLICY.md"]) {
    if (await tryContent(`${base(owner, repo)}/contents/${p}`, "AI_POLICY")) break;
  }
  return docs;
}

/* ---------------- orchestrator ---------------- */

async function settle<T>(p: Promise<CheckRun<T>>): Promise<CheckRun<T>> {
  try {
    return await p;
  } catch (err) {
    return { status: "failed", error: errorMessage(err) };
  }
}

export interface VerifyTarget {
  owner: string;
  repo: string;
  number: number;
}

export function verificationKey(t: VerifyTarget): string {
  return `${t.owner}/${t.repo}#${t.number}`.toLowerCase();
}

/**
 * Run every check concurrently. `onCheck` fires as each check finishes so the UI
 * can show real per-check progress. Returns the final verification.
 */
export async function runVerification(
  t: VerifyTarget,
  opts: { force?: boolean; onCheck?: (check: CheckKey, run: CheckRun<unknown>) => void } = {},
): Promise<Verification> {
  const key = verificationKey(t);
  const emitAll = (v: Verification) => {
    for (const [k, run] of Object.entries(v.checks)) opts.onCheck?.(k as CheckKey, run as CheckRun<unknown>);
  };

  if (!opts.force) {
    const hit = verificationCache.get(key);
    if (hit) {
      const v = { ...hit.value, cached: true };
      emitAll(v);
      return v;
    }
  }

  const started = Date.now();
  const { owner, repo, number } = t;
  const now = () => new Date();
  const checks: VerificationChecks = {};
  const emit = <T,>(k: CheckKey, run: CheckRun<T>) => {
    (checks as Record<CheckKey, CheckRun<unknown>>)[k] = run as CheckRun<unknown>;
    opts.onCheck?.(k, run as CheckRun<unknown>);
    return run;
  };

  const issueP = ghRest<RawIssue>(`${base(owner, repo)}/issues/${number}`).then((r) => r.data);
  const repoP = repoCache.getOrLoad(`${owner}/${repo}`.toLowerCase(), REPO_TTL, () => loadRepo(owner, repo), { force: opts.force }).then((r) => r.value);

  const assignmentP = settle<AssignmentData>(
    issueP.then((i) => {
      if (i.pull_request) throw new Error("This number belongs to a pull request");
      return { status: "ok", data: { state: i.state, assignees: (i.assignees ?? []).map((a) => a.login), locked: i.locked } };
    }),
  ).then((r) => emit("assignment", r));

  const claimsP = settle<ClaimsData>(
    issueP.then(async (i) => {
      const { comments } = await fetchIssueComments(owner, repo, number, i.comments);
      return { status: "ok", data: detectClaims(comments, { now: now(), commentsTotal: i.comments }) };
    }),
  ).then((r) => emit("claims", r));

  const prsP = settle<PrData>(fetchPrs(owner, repo, number)).then((r) => emit("prs", r));

  const repoCheckP = settle<RepoData>(repoP.then((r) => ({ status: "ok", data: assessRepo(r, now()) }))).then((r) => emit("repo", r));

  const maintP = settle<MaintainerData>(
    Promise.all([
      repoCommentsCache.getOrLoad(`${owner}/${repo}`.toLowerCase(), REPO_TTL / 2, () => loadRepoComments(owner, repo), { force: opts.force }),
      repoP.catch(() => null),
    ]).then(([c, r]) => ({ status: "ok", data: assessMaintainers(c.value, r?.merged90 ?? null, now()) })),
  ).then((r) => emit("maintainers", r));

  const policyP = settle<PolicyData>(
    policyCache.getOrLoad(`${owner}/${repo}`.toLowerCase(), POLICY_TTL, () => loadPolicyDocs(owner, repo)).then((d) => ({ status: "ok", data: scanPolicies(d.value) })),
  ).then((r) => emit("policy", r));

  await Promise.all([assignmentP, claimsP, prsP, repoCheckP, maintP, policyP]);

  const verification: Verification = {
    key,
    checks,
    result: assess(checks),
    checkedAt: new Date().toISOString(),
    cached: false,
  };

  const failed = Object.values(checks).filter((c) => c?.status === "failed").length;
  // Only cache complete results so transient failures are retried next time.
  if (failed === 0) verificationCache.set(key, verification, ISSUE_TTL);
  log(failed ? "warn" : "info", "verify", { key, ms: Date.now() - started, failed, assessment: verification.result.assessment });
  return verification;
}
