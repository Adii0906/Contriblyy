// Pure ranking: verification first, then match quality, with skill diversity.
import type { IssueSummary, Profile, Verification } from "@/lib/types";
import { scoreIssue, type MatchResult } from "./score";

export interface RankedIssue {
  issue: IssueSummary;
  match: MatchResult;
  verification?: Verification;
  /** 0 promising, 1 pending, 2 needs review, 3 likely unavailable */
  bucket: number;
}

export function bucketOf(v?: Verification): number {
  if (!v) return 1;
  switch (v.result.assessment) {
    case "promising":
      return 0;
    case "needs-review":
      return 2;
    case "likely-unavailable":
      return 3;
  }
}

export type SortMode = "best" | "recent";

export function rankIssues(
  issues: IssueSummary[],
  profile: Profile,
  verifications: Record<string, Verification | undefined>,
  keyOf: (i: IssueSummary) => string,
  sort: SortMode = "best",
): RankedIssue[] {
  const scored = issues.map((issue) => {
    const verification = verifications[keyOf(issue)];
    return { issue, verification, match: scoreIssue(issue, profile, verification), bucket: bucketOf(verification) };
  });

  if (sort === "recent") {
    return scored.sort((a, b) => a.bucket - b.bucket || Date.parse(b.issue.updatedAt) - Date.parse(a.issue.updatedAt));
  }

  // Verification takes precedence: a blocked issue never outranks an unblocked one.
  scored.sort((a, b) => a.bucket - b.bucket || b.match.points - a.match.points);
  return diversify(scored);
}

/**
 * Within each verification bucket, greedily pick the best remaining issue while
 * penalising repeats of the same primary skill, so several selected skills show up.
 */
export function diversify(sorted: RankedIssue[], penalty = 9): RankedIssue[] {
  const out: RankedIssue[] = [];
  const buckets = new Map<number, RankedIssue[]>();
  for (const r of sorted) buckets.set(r.bucket, [...(buckets.get(r.bucket) ?? []), r]);
  for (const bucket of [...buckets.keys()].sort((a, b) => a - b)) {
    const pool = [...buckets.get(bucket)!];
    const used = new Map<string, number>();
    while (pool.length) {
      let bestIdx = 0;
      let bestVal = -Infinity;
      pool.forEach((r, idx) => {
        const k = r.match.primarySkillId ?? "none";
        const v = r.match.points - (used.get(k) ?? 0) * penalty;
        if (v > bestVal) {
          bestVal = v;
          bestIdx = idx;
        }
      });
      const [pick] = pool.splice(bestIdx, 1);
      const k = pick!.match.primarySkillId ?? "none";
      used.set(k, (used.get(k) ?? 0) + 1);
      out.push(pick!);
    }
  }
  return out;
}

export function issueKey(i: IssueSummary): string {
  return `${i.repo.owner}/${i.repo.name}#${i.number}`.toLowerCase();
}
