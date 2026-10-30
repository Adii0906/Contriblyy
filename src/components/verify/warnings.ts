import type { AssignmentData, CheckKey, CheckRun, ClaimsData, MaintainerData, PolicyData, PrData, RepoData } from "@/lib/types";
import { timeAgo } from "@/lib/utils";

export interface CardWarning {
  check: CheckKey;
  severity: "bad" | "warn";
  title: string; // shown uppercase
  detail: string;
}

const days = (n: number) => (n === 0 ? "today" : `${n} day${n === 1 ? "" : "s"} ago`);

/**
 * Turns completed check results into card warnings. Only checks that actually
 * reported data can produce a warning; pending checks never do, and a failed
 * check only does when GitHub explicitly answered 404 (issue unavailable).
 */
export function deriveWarnings(checks: Partial<Record<CheckKey, CheckRun<unknown>>>): CardWarning[] {
  const out: CardWarning[] = [];
  const ok = <T,>(k: CheckKey) => (checks[k]?.status === "ok" ? ((checks[k] as { data: T }).data as T) : undefined);

  const a = ok<AssignmentData>("assignment");
  const ar = checks.assignment;
  if (ar?.status === "failed" && /not found/i.test(ar.error)) {
    out.push({ check: "assignment", severity: "bad", title: "Issue unavailable", detail: "GitHub returned not found. The issue or repository may have been deleted, moved or made private." });
  }
  if (a?.state === "closed") out.push({ check: "assignment", severity: "bad", title: "Issue closed", detail: "GitHub now reports this issue as closed." });
  else if (a?.assignees.length) out.push({ check: "assignment", severity: "bad", title: "Already assigned", detail: `Assigned to @${a.assignees.join(", @")}.` });
  else if (a?.locked) out.push({ check: "assignment", severity: "bad", title: "Conversation locked", detail: "Maintainers locked this thread." });

  const c = ok<ClaimsData>("claims");
  const lastClaim = c?.claims.filter((x) => !x.released).at(-1);
  if (c?.status === "active" && lastClaim) {
    out.push({
      check: "claims",
      severity: "bad",
      title: "Already claimed",
      detail: `@${lastClaim.author} ${lastClaim.kind === "active" ? "said they are working on it" : "asked for it and a maintainer agreed"}, last active ${days(lastClaim.ageDays)}.`,
    });
  } else if (c?.status === "possible" && lastClaim) {
    out.push({ check: "claims", severity: "warn", title: "Possible claim", detail: `@${lastClaim.author} asked to work on it ${days(lastClaim.ageDays)}. Ask on the thread before starting.` });
  }

  const p = ok<PrData>("prs");
  const pr = p?.prs[0];
  if (p?.status === "confirmed-open" && pr) out.push({ check: "prs", severity: "bad", title: "Pull request in progress", detail: `Open PR #${pr.number} is linked to this issue.` });
  else if (p?.status === "merged" && pr) out.push({ check: "prs", severity: "bad", title: "Already fixed", detail: `PR #${pr.number}, which closes this issue, was merged.` });
  else if (p?.status === "possible" && pr) out.push({ check: "prs", severity: "warn", title: "Possible related PR", detail: `PR #${pr.number} mentions this issue without a closing link.` });

  const r = ok<RepoData>("repo");
  if (r?.activity === "archived") out.push({ check: "repo", severity: "bad", title: "Repository archived", detail: "The repository is read only. New pull requests cannot be merged." });
  else if (r?.activity === "limited") out.push({ check: "repo", severity: "warn", title: "Limited recent activity", detail: r.lastCommitAt ? `Last commit ${timeAgo(r.lastCommitAt)}. Quiet does not mean abandoned.` : "Few recent commits or merges." });

  const m = ok<MaintainerData>("maintainers");
  if (m?.activity === "quiet") {
    out.push({
      check: "maintainers",
      severity: "bad",
      title: "Maintainer inactive",
      detail: m.lastMaintainerCommentAt
        ? `No maintainer comments in the last 90 days. Last one was ${timeAgo(m.lastMaintainerCommentAt)}.`
        : `No maintainer comments in the ${m.sampleSize} most recent repository comments.`,
    });
  }

  const pol = ok<PolicyData>("policy");
  const ai = pol?.findings.find((f) => f.type === "ai-restricted");
  if (ai) out.push({ check: "policy", severity: "warn", title: "AI contributions restricted", detail: `${ai.doc} restricts AI-generated contributions. See the quoted rule in evidence.` });

  return out.sort((x, y) => (x.severity === y.severity ? 0 : x.severity === "bad" ? -1 : 1));
}
