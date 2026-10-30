// Pure rules engine: turns individual check results into one evidence-based assessment.
import type { AssessmentReason, AssessmentResult, CheckKey, VerificationChecks } from "@/lib/types";

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

export function assess(checks: VerificationChecks): AssessmentResult {
  const reasons: AssessmentReason[] = [];
  const incomplete: CheckKey[] = [];
  const add = (severity: AssessmentReason["severity"], check: CheckKey, text: string) => reasons.push({ severity, check, text });

  const { assignment, claims, prs, repo, maintainers, policy } = checks;

  // Assignment
  if (assignment?.status === "ok") {
    const a = assignment.data;
    if (a.state === "closed") add("blocking", "assignment", "The issue is now closed.");
    if (a.assignees.length) add("blocking", "assignment", `Assigned to ${a.assignees.map((x) => "@" + x).join(", ")}.`);
    if (a.locked) add("blocking", "assignment", "The conversation is locked.");
  } else incomplete.push("assignment");

  // Claims
  if (claims?.status === "ok") {
    const c = claims.data;
    const live = c.claims.filter((x) => !x.released);
    const latest = live.at(-1);
    if (c.status === "active" && latest) {
      add("blocking", "claims", `@${latest.author} ${latest.kind === "active" ? "said they are working on it" : "asked to work on it and a maintainer agreed"} ${latest.ageDays === 0 ? "today" : plural(latest.ageDays, "day") + " ago"}.`);
    } else if (c.status === "possible" && latest) {
      add("review", "claims", `Possible claim by @${latest.author}, ${latest.ageDays === 0 ? "today" : plural(latest.ageDays, "day") + " ago"}. Ask before starting.`);
    } else if (c.status === "stale" && latest) {
      add("info", "claims", `Older claim by @${latest.author} (${plural(latest.ageDays, "day")} without follow up).`);
    }
    if (c.commentsScanned < c.commentsTotal) add("info", "claims", `Scanned ${c.commentsScanned} of ${c.commentsTotal} comments.`);
  } else incomplete.push("claims");

  // Pull requests
  if (prs?.status === "ok") {
    const p = prs.data;
    const top = p.prs[0];
    if (p.status === "confirmed-open" && top) add("blocking", "prs", `Open pull request #${top.number} is linked to this issue.`);
    else if (p.status === "merged" && top) add("blocking", "prs", `Pull request #${top.number} that closes this issue was already merged.`);
    else if (p.status === "possible" && top) add("review", "prs", `Pull request #${top.number} references this issue without a closing link.`);
    else if (p.status === "closed-only") add("info", "prs", "Earlier pull requests were closed without merging.");
    if (!p.complete) add("info", "prs", "Pull request search was partial for this issue.");
  } else incomplete.push("prs");

  // Repository
  if (repo?.status === "ok") {
    const r = repo.data;
    if (r.activity === "archived") add("blocking", "repo", r.archived ? "The repository is archived." : "The repository is disabled.");
    else if (r.activity === "limited") add("review", "repo", "Limited recent activity in the repository.");
    else if (r.activity === "insufficient") add("info", "repo", "Not enough evidence to judge repository activity.");
  } else incomplete.push("repo");

  // Maintainers
  if (maintainers?.status === "ok") {
    if (maintainers.data.activity === "quiet") add("review", "maintainers", "No maintainer comments seen in the last 90 days.");
  } else incomplete.push("maintainers");

  // Policy
  if (policy?.status === "ok") {
    for (const f of policy.data.findings) {
      if (f.type === "ai-restricted") add("review", "policy", `${f.doc} restricts AI-generated contributions.`);
      if (f.type === "assignment-required") add("info", "policy", `${f.doc} asks contributors to get assigned or comment first.`);
    }
  } else incomplete.push("policy");

  // Any check that could not run prevents a "promising" verdict.
  for (const k of incomplete) add("review", k, `${CHECK_LABEL[k]} check could not be completed.`);

  const blocking = reasons.some((r) => r.severity === "blocking");
  const review = reasons.some((r) => r.severity === "review");

  const rank = { blocking: 0, review: 1, info: 2 } as const;
  reasons.sort((a, b) => rank[a.severity] - rank[b.severity]);

  return {
    assessment: blocking ? "likely-unavailable" : review ? "needs-review" : "promising",
    reasons,
    incomplete,
  };
}

export const CHECK_LABEL: Record<CheckKey, string> = {
  assignment: "Assignment",
  claims: "Comment claims",
  prs: "Pull requests",
  repo: "Repository activity",
  maintainers: "Maintainer activity",
  policy: "Contribution policy",
};

export const CHECK_ORDER: CheckKey[] = ["assignment", "claims", "prs", "repo", "maintainers", "policy"];
