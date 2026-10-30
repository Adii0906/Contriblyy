// Pure repository-health and maintainer-activity assessment.
import type { MaintainerActivity, MaintainerData, RepoActivity, RepoData } from "@/lib/types";
import { MAINTAINER_ASSOCIATIONS } from "./claims";

const DAY = 86_400_000;
const daysSince = (iso: string | null, now: number) => (iso ? Math.floor((now - Date.parse(iso)) / DAY) : null);

export interface RepoInput {
  archived: boolean;
  disabled: boolean;
  language: string | null;
  topics: string[];
  stars: number;
  pushedAt: string | null;
  commits90: number | null;
  commitsCapped: boolean;
  lastCommitAt: string | null;
  merged90: number | null;
  lastMergedAt: string | null;
}

export function assessRepo(input: RepoInput, now: Date): RepoData {
  const t = now.getTime();
  const reasons: string[] = [];
  let activity: RepoActivity;
  const lastCommitDays = daysSince(input.lastCommitAt, t);
  const lastMergeDays = daysSince(input.lastMergedAt, t);

  if (input.archived || input.disabled) {
    activity = "archived";
    reasons.push(input.archived ? "Repository is archived (read only)." : "Repository is disabled.");
  } else if (input.commits90 === null && input.merged90 === null) {
    activity = "insufficient";
    reasons.push("Commit and pull request history could not be read.");
  } else {
    const commits = input.commits90 ?? 0;
    const merged = input.merged90 ?? 0;
    if (input.commits90 !== null) {
      reasons.push(
        commits === 0
          ? "No commits on the default branch in the last 90 days."
          : `${input.commitsCapped ? "100+" : commits} commit${commits === 1 ? "" : "s"} on the default branch in the last 90 days.`,
      );
    }
    if (input.merged90 !== null) {
      reasons.push(merged === 0 ? "No pull requests merged in the last 90 days (from the 50 most recently closed)." : `${merged} pull request${merged === 1 ? "" : "s"} merged in the last 90 days.`);
    }
    if ((commits >= 10 || merged >= 5) && lastCommitDays !== null && lastCommitDays <= 30) activity = "recently-active";
    else if (commits > 0 || merged > 0) activity = "some";
    else if ((lastCommitDays !== null && lastCommitDays <= 365) || (lastMergeDays !== null && lastMergeDays <= 365)) activity = "limited";
    else if (lastCommitDays === null && lastMergeDays === null) activity = "insufficient";
    else activity = "limited";
    if (activity === "limited" && lastCommitDays !== null) reasons.push(`Last commit was ${lastCommitDays} days ago. Quiet does not mean abandoned.`);
  }

  return { activity, ...input, reasons };
}

export interface RepoCommentInput {
  author: string;
  association: string;
  createdAt: string;
  isBot?: boolean;
}

export function assessMaintainers(comments: RepoCommentInput[], merged90: number | null, now: Date): MaintainerData {
  const t = now.getTime();
  const human = comments.filter((c) => !c.isBot && !/\[bot\]$/i.test(c.author));
  const within = (c: RepoCommentInput, d: number) => t - Date.parse(c.createdAt) <= d * DAY;
  const maint = human.filter((c) => MAINTAINER_ASSOCIATIONS.has(c.association));
  const m30 = maint.filter((c) => within(c, 30)).length;
  const m90 = maint.filter((c) => within(c, 90));
  const distinct = new Set(m90.map((c) => c.author)).size;
  const contrib90 = human.filter((c) => !MAINTAINER_ASSOCIATIONS.has(c.association) && within(c, 90)).length;
  const lastMaint = maint.map((c) => c.createdAt).sort().at(-1) ?? null;
  const oldest = human.map((c) => c.createdAt).sort()[0];
  const span = oldest ? Math.floor((t - Date.parse(oldest)) / DAY) : null;

  const reasons: string[] = [];
  let activity: MaintainerActivity;
  if (human.length === 0) {
    activity = merged90 && merged90 > 0 ? "some" : "insufficient";
    reasons.push("No recent issue or pull request comments were available to sample.");
    if (merged90) reasons.push(`${merged90} merged pull request${merged90 === 1 ? "" : "s"} in 90 days suggests someone is reviewing.`);
  } else {
    if (m30 >= 5 || (distinct >= 2 && m30 >= 2)) activity = "responsive";
    else if (m90.length > 0 || (merged90 ?? 0) > 0) activity = "some";
    else if (span !== null && span >= 60) activity = "quiet";
    else activity = "insufficient";
    reasons.push(`${m30} maintainer comment${m30 === 1 ? "" : "s"} in the last 30 days, ${m90.length} in 90 days, from ${distinct} maintainer${distinct === 1 ? "" : "s"}.`);
    reasons.push(`Based on the ${human.length} most recent comments across the repository's issues and pull requests.`);
  }
  reasons.push("Maintainers are owners, members and collaborators. Past activity does not promise a reply.");

  return {
    activity,
    maintainerComments30: m30,
    maintainerComments90: m90.length,
    distinctMaintainers90: distinct,
    contributorComments90: contrib90,
    lastMaintainerCommentAt: lastMaint,
    sampleSize: human.length,
    sampleSpanDays: span,
    reasons,
  };
}
