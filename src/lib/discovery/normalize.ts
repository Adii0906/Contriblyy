// Pure helpers to normalize GitHub issue payloads.
import type { IssueSummary } from "@/lib/types";

export interface RawSearchIssue {
  id: number;
  number: number;
  title: string;
  html_url: string;
  repository_url: string;
  body: string | null;
  labels: ({ name?: string; color?: string } | string)[];
  comments: number;
  created_at: string;
  updated_at: string;
  user: { login: string } | null;
  assignees?: { login: string }[] | null;
  pull_request?: unknown;
  state: string;
}

export function stripMarkdown(md: string): string {
  return md
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/^#+\s*/gm, "")
    .replace(/[*_>~|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeIssue(raw: RawSearchIssue, foundBy: string[]): IssueSummary | null {
  if (raw.pull_request) return null;
  const m = raw.repository_url.match(/repos\/([^/]+)\/([^/]+)$/);
  if (!m) return null;
  const [, owner, name] = m;
  const body = raw.body ?? "";
  const plain = stripMarkdown(body);
  return {
    id: raw.id,
    number: raw.number,
    title: raw.title.trim(),
    url: raw.html_url,
    bodyExcerpt: plain.slice(0, 280),
    bodyText: plain.slice(0, 4000),
    bodyLength: body.length,
    codeBlocks: (body.match(/```/g)?.length ?? 0) >> 1,
    taskCount: body.match(/^\s*[-*]\s+\[[ xX]\]/gm)?.length ?? 0,
    labels: raw.labels
      .map((l) => (typeof l === "string" ? { name: l, color: "8b8b98" } : { name: l.name ?? "", color: l.color ?? "8b8b98" }))
      .filter((l) => l.name),
    comments: raw.comments,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    author: raw.user?.login ?? null,
    assignees: (raw.assignees ?? []).map((a) => a.login),
    repo: { owner, name, fullName: `${owner}/${name}`, url: `https://github.com/${owner}/${name}` },
    foundBy,
  };
}

/** Merge issue lists, dedupe by id, combine foundBy, cap issues per repo for variety. */
export function mergeIssues(lists: IssueSummary[][], perRepoCap = 3): IssueSummary[] {
  const byId = new Map<number, IssueSummary>();
  for (const list of lists) {
    for (const issue of list) {
      const prev = byId.get(issue.id);
      if (prev) prev.foundBy = Array.from(new Set([...prev.foundBy, ...issue.foundBy]));
      else byId.set(issue.id, { ...issue, foundBy: [...issue.foundBy] });
    }
  }
  const perRepo = new Map<string, number>();
  const out: IssueSummary[] = [];
  // Issues found by several queries first, then most recently updated.
  const sorted = [...byId.values()].sort(
    (a, b) => b.foundBy.length - a.foundBy.length || Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
  );
  for (const issue of sorted) {
    const n = perRepo.get(issue.repo.fullName) ?? 0;
    if (n >= perRepoCap) continue;
    perRepo.set(issue.repo.fullName, n + 1);
    out.push(issue);
  }
  return out;
}
