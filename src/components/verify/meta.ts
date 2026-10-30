import type {
  AssignmentData,
  CheckKey,
  CheckRun,
  ClaimsData,
  MaintainerData,
  PolicyData,
  PrData,
  RepoData,
} from "@/lib/types";

export type Tone = "ok" | "warn" | "bad" | "neutral" | "pending" | "failed";

export interface CheckSummary {
  tone: Tone;
  text: string;
}

export const TONE_COLOR: Record<Tone, string> = {
  ok: "var(--ok)",
  warn: "var(--warn)",
  bad: "var(--bad)",
  neutral: "var(--muted)",
  pending: "var(--idle)",
  failed: "var(--muted)",
};

export const TONE_SOFT: Record<Tone, string> = {
  ok: "var(--ok-soft)",
  warn: "var(--warn-soft)",
  bad: "var(--bad-soft)",
  neutral: "var(--sand)",
  pending: "var(--sand)",
  failed: "var(--sand)",
};

export const CHECK_SHORT: Record<CheckKey, string> = {
  assignment: "Assignment",
  claims: "Claims",
  prs: "Pull requests",
  repo: "Repository",
  maintainers: "Maintainers",
  policy: "Policy",
};

/**
 * One-line, evidence-backed summary of a check. A check that has not reported
 * is "Not verified yet"; a failed check is never shown as positive or negative.
 */
export function summarize(check: CheckKey, run: CheckRun<unknown> | undefined): CheckSummary {
  if (!run) return { tone: "pending", text: "Not verified yet" };
  if (run.status === "failed") return { tone: "failed", text: "Could not check" };
  switch (check) {
    case "assignment": {
      const d = run.data as AssignmentData;
      if (d.state === "closed") return { tone: "bad", text: "Issue closed" };
      if (d.assignees.length) return { tone: "bad", text: `Assigned to @${d.assignees[0]}` };
      if (d.locked) return { tone: "bad", text: "Conversation locked" };
      return { tone: "ok", text: "Unassigned" };
    }
    case "claims": {
      const d = run.data as ClaimsData;
      if (d.status === "active") return { tone: "bad", text: "Claimed in comments" };
      if (d.status === "possible") return { tone: "warn", text: "Possible claim" };
      if (d.status === "stale") return { tone: "neutral", text: "Old claim, no follow up" };
      return { tone: "ok", text: d.commentsTotal === 0 ? "No comments yet" : "No claims found" };
    }
    case "prs": {
      const d = run.data as PrData;
      if (d.status === "confirmed-open") return { tone: "bad", text: "Open PR linked" };
      if (d.status === "merged") return { tone: "bad", text: "Fix already merged" };
      if (d.status === "possible") return { tone: "warn", text: "Possible related PR" };
      if (d.status === "closed-only") return { tone: "neutral", text: "Only closed PRs" };
      return { tone: "ok", text: d.complete ? "No linked PR" : "None in scanned history" };
    }
    case "repo": {
      const d = run.data as RepoData;
      const map: Record<RepoData["activity"], CheckSummary> = {
        "recently-active": { tone: "ok", text: "Recently active" },
        some: { tone: "ok", text: "Some recent activity" },
        limited: { tone: "warn", text: "Limited recent activity" },
        insufficient: { tone: "neutral", text: "Insufficient evidence" },
        archived: { tone: "bad", text: d.archived ? "Archived" : "Disabled" },
      };
      return map[d.activity];
    }
    case "maintainers": {
      const d = run.data as MaintainerData;
      const map: Record<MaintainerData["activity"], CheckSummary> = {
        responsive: { tone: "ok", text: "Maintainers active" },
        some: { tone: "ok", text: "Some maintainer activity" },
        // "quiet" only happens when the sample covers 60+ days with zero maintainer comments in 90.
        quiet: { tone: "bad", text: "Maintainer inactive" },
        insufficient: { tone: "neutral", text: "Needs review" },
      };
      return map[d.activity];
    }
    case "policy": {
      const d = run.data as PolicyData;
      if (d.status === "restriction") return { tone: "warn", text: "Restricts AI contributions" };
      if (d.status === "requirements") return { tone: "neutral", text: "Has contribution rules" };
      if (d.status === "no-docs") return { tone: "neutral", text: "No contributing docs" };
      return { tone: "ok", text: "No explicit restriction" };
    }
  }
}
