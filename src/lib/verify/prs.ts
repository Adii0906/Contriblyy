// Pure PR classification + payload parsers for GraphQL and REST timeline.
import type { PrData, PrLinkType, PrRef, PrStatus } from "@/lib/types";

const LINK_RANK: Record<PrLinkType, number> = { closing: 0, connected: 1, mention: 2 };

/** Dedupe by url keeping the strongest link type. */
export function dedupePrs(prs: PrRef[]): PrRef[] {
  const map = new Map<string, PrRef>();
  for (const pr of prs) {
    const prev = map.get(pr.url);
    if (!prev || LINK_RANK[pr.linkType] < LINK_RANK[prev.linkType]) map.set(pr.url, pr);
  }
  return [...map.values()].sort((a, b) => LINK_RANK[a.linkType] - LINK_RANK[b.linkType] || Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

export function classifyPrs(prs: PrRef[]): PrStatus {
  if (prs.length === 0) return "none";
  const linked = (p: PrRef) => p.linkType === "closing" || p.linkType === "connected";
  if (prs.some((p) => p.state === "open" && linked(p))) return "confirmed-open";
  if (prs.some((p) => p.state === "merged" && linked(p))) return "merged";
  if (prs.some((p) => p.state === "open" || p.state === "merged")) return "possible";
  return "closed-only";
}

export function buildPrData(prs: PrRef[], source: PrData["source"], complete: boolean): PrData {
  const deduped = dedupePrs(prs);
  return { status: classifyPrs(deduped), prs: deduped.slice(0, 8), source, complete };
}

/* ---------- GraphQL ---------- */

export const PR_GRAPHQL = /* GraphQL */ `
  query IssuePRs($owner: String!, $name: String!, $number: Int!) {
    repository(owner: $owner, name: $name) {
      issue(number: $number) {
        closedByPullRequestsReferences(first: 10, includeClosedPrs: true) {
          totalCount
          nodes { ...Pr }
        }
        timelineItems(last: 60, itemTypes: [CROSS_REFERENCED_EVENT, CONNECTED_EVENT]) {
          totalCount
          nodes {
            __typename
            ... on CrossReferencedEvent { willCloseTarget source { __typename ... on PullRequest { ...Pr } } }
            ... on ConnectedEvent { subject { __typename ... on PullRequest { ...Pr } } }
          }
        }
      }
    }
  }
  fragment Pr on PullRequest {
    number title url state merged isDraft createdAt updatedAt
    author { login }
    repository { nameWithOwner }
  }
`;

interface GqlPr {
  number: number;
  title: string;
  url: string;
  state: "OPEN" | "CLOSED" | "MERGED";
  merged: boolean;
  isDraft: boolean;
  createdAt: string;
  updatedAt: string;
  author: { login: string } | null;
  repository: { nameWithOwner: string };
}

type GqlTimelineNode =
  | { __typename: "CrossReferencedEvent"; willCloseTarget: boolean; source: (Partial<GqlPr> & { __typename: string }) | null }
  | { __typename: "ConnectedEvent"; subject: (Partial<GqlPr> & { __typename: string }) | null }
  | { __typename: string };

export interface GqlIssuePrs {
  repository: {
    issue: {
      closedByPullRequestsReferences: { totalCount: number; nodes: GqlPr[] };
      timelineItems: { totalCount: number; nodes: GqlTimelineNode[] };
    } | null;
  } | null;
}

function fromGql(p: GqlPr, linkType: PrLinkType): PrRef {
  return {
    number: p.number,
    title: p.title,
    url: p.url,
    state: p.merged || p.state === "MERGED" ? "merged" : p.state === "OPEN" ? "open" : "closed",
    isDraft: p.isDraft,
    author: p.author?.login ?? null,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    repo: p.repository.nameWithOwner,
    linkType,
  };
}

export function parseGraphqlPrs(data: GqlIssuePrs): { prs: PrRef[]; complete: boolean } | null {
  const issue = data.repository?.issue;
  if (!issue) return null;
  const prs: PrRef[] = issue.closedByPullRequestsReferences.nodes.map((p) => fromGql(p, "closing"));
  for (const n of issue.timelineItems.nodes) {
    if (n.__typename === "CrossReferencedEvent" && "source" in n && n.source?.__typename === "PullRequest") {
      prs.push(fromGql(n.source as GqlPr, n.willCloseTarget ? "closing" : "mention"));
    } else if (n.__typename === "ConnectedEvent" && "subject" in n && n.subject?.__typename === "PullRequest") {
      prs.push(fromGql(n.subject as GqlPr, "connected"));
    }
  }
  const complete = issue.timelineItems.totalCount <= 60 && issue.closedByPullRequestsReferences.totalCount <= 10;
  return { prs, complete };
}

/* ---------- REST timeline ---------- */

export interface RestTimelineEvent {
  event: string;
  created_at?: string;
  source?: {
    type?: string;
    issue?: {
      number: number;
      title: string;
      html_url: string;
      state: string;
      draft?: boolean;
      created_at: string;
      updated_at: string;
      user?: { login: string } | null;
      body?: string | null;
      repository?: { full_name: string };
      repository_url?: string;
      pull_request?: { merged_at?: string | null; html_url?: string };
    };
  };
}

const CLOSING_RE = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s*:?\s+(?:[\w.-]+\/[\w.-]+)?#(\d+)\b/gi;

export function bodyClosesIssue(body: string | null | undefined, issueNumber: number, sameRepo: boolean): boolean {
  if (!body) return false;
  for (const m of body.matchAll(CLOSING_RE)) {
    const hasRepoPrefix = /\//.test(m[0]);
    if (Number(m[1]) === issueNumber && (sameRepo || hasRepoPrefix)) return true;
  }
  return false;
}

export function parseRestTimeline(events: RestTimelineEvent[], issueNumber: number, issueRepo: string): PrRef[] {
  const prs: PrRef[] = [];
  for (const ev of events) {
    if (ev.event !== "cross-referenced") continue;
    const src = ev.source?.issue;
    if (!src?.pull_request) continue;
    const repo = src.repository?.full_name ?? src.repository_url?.replace(/^.*repos\//, "") ?? issueRepo;
    const merged = Boolean(src.pull_request.merged_at);
    const closes = bodyClosesIssue(src.body, issueNumber, repo.toLowerCase() === issueRepo.toLowerCase());
    prs.push({
      number: src.number,
      title: src.title,
      url: src.pull_request.html_url ?? src.html_url,
      state: merged ? "merged" : src.state === "open" ? "open" : "closed",
      isDraft: Boolean(src.draft),
      author: src.user?.login ?? null,
      createdAt: src.created_at,
      updatedAt: src.updated_at,
      repo,
      linkType: closes ? "closing" : "mention",
    });
  }
  return prs;
}
