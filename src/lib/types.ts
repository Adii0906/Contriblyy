// Shared domain types. Used on both server and client.

export type Proficiency = "learning" | "comfortable" | "experienced";
export type TimeBudget = "2-4" | "5-8" | "9-15" | "15+";
export type ScopePreference = "quick" | "few-hours" | "multi-day" | "any";

export interface SkillSelection {
  id: string;
  label: string;
  proficiency: Proficiency;
  custom?: boolean;
}

export interface Profile {
  skills: SkillSelection[];
  time: TimeBudget;
  scope: ScopePreference;
  updatedAt: string;
}

export interface IssueLabel {
  name: string;
  color: string;
}

export interface RepoRef {
  owner: string;
  name: string;
  fullName: string;
  url: string;
}

export interface IssueSummary {
  id: number;
  number: number;
  title: string;
  url: string;
  bodyExcerpt: string;
  bodyText: string; // trimmed body used for matching (max ~4k chars)
  bodyLength: number;
  codeBlocks: number;
  taskCount: number;
  labels: IssueLabel[];
  comments: number;
  createdAt: string;
  updatedAt: string;
  author: string | null;
  assignees: string[];
  repo: RepoRef;
  /** skill ids whose search query surfaced this issue */
  foundBy: string[];
}

export interface DiscoverResponse {
  issues: IssueSummary[];
  queries: { skillId: string; query: string; ok: boolean; total?: number; error?: string }[];
  page: number;
  hasMore: boolean;
  partial: boolean;
  fetchedAt: string;
  cached: boolean;
  rateLimit?: RateLimitInfo;
}

export interface RateLimitInfo {
  resource: string;
  limit: number;
  remaining: number;
  resetAt: string;
}

/* ---------------- Verification ---------------- */

export type CheckKey = "assignment" | "claims" | "prs" | "repo" | "maintainers" | "policy";

export type CheckRun<T> =
  | { status: "ok"; data: T; partial?: boolean; note?: string }
  | { status: "failed"; error: string };

export interface AssignmentData {
  state: "open" | "closed";
  assignees: string[];
  locked: boolean;
}

export type ClaimKind = "active" | "request";

export interface Claim {
  commentId: number;
  author: string;
  association: string;
  kind: ClaimKind;
  acknowledged: boolean;
  released: boolean;
  createdAt: string;
  /** days since the claimant's latest comment on the issue */
  ageDays: number;
  url: string;
  excerpt: string;
}

export type ClaimStatus = "active" | "possible" | "stale" | "none";

export interface ClaimsData {
  status: ClaimStatus;
  claims: Claim[];
  commentsScanned: number;
  commentsTotal: number;
  interestOnly: number; // "is anyone working on this?" style comments
  maintainerCommentedAt: string | null;
}

export type PrLinkType = "closing" | "connected" | "mention";

export interface PrRef {
  number: number;
  title: string;
  url: string;
  state: "open" | "closed" | "merged";
  isDraft: boolean;
  author: string | null;
  createdAt: string;
  updatedAt: string;
  repo: string;
  linkType: PrLinkType;
}

export type PrStatus = "confirmed-open" | "merged" | "possible" | "closed-only" | "none";

export interface PrData {
  status: PrStatus;
  prs: PrRef[];
  source: "graphql" | "rest-timeline";
  complete: boolean;
}

export type RepoActivity = "recently-active" | "some" | "limited" | "insufficient" | "archived";

export interface RepoData {
  activity: RepoActivity;
  archived: boolean;
  disabled: boolean;
  language: string | null;
  topics: string[];
  stars: number;
  pushedAt: string | null;
  commits90: number | null; // capped at 100
  commitsCapped: boolean;
  lastCommitAt: string | null;
  merged90: number | null;
  lastMergedAt: string | null;
  reasons: string[];
}

export type MaintainerActivity = "responsive" | "some" | "quiet" | "insufficient";

export interface MaintainerData {
  activity: MaintainerActivity;
  maintainerComments30: number;
  maintainerComments90: number;
  distinctMaintainers90: number;
  contributorComments90: number;
  lastMaintainerCommentAt: string | null;
  sampleSize: number;
  sampleSpanDays: number | null;
  reasons: string[];
}

export type PolicyFindingType = "ai-restricted" | "ai-disclosure" | "assignment-required" | "cla" | "dco";

export interface PolicyFinding {
  type: PolicyFindingType;
  severity: "warning" | "info";
  doc: string;
  url: string;
  excerpt: string;
}

export type PolicyStatus = "restriction" | "requirements" | "none-detected" | "no-docs";

export interface PolicyData {
  status: PolicyStatus;
  findings: PolicyFinding[];
  docsChecked: { name: string; url: string }[];
}

export interface VerificationChecks {
  assignment?: CheckRun<AssignmentData>;
  claims?: CheckRun<ClaimsData>;
  prs?: CheckRun<PrData>;
  repo?: CheckRun<RepoData>;
  maintainers?: CheckRun<MaintainerData>;
  policy?: CheckRun<PolicyData>;
}

export type Assessment = "promising" | "needs-review" | "likely-unavailable";

export interface AssessmentReason {
  severity: "blocking" | "review" | "info";
  check: CheckKey;
  text: string;
}

export interface AssessmentResult {
  assessment: Assessment;
  reasons: AssessmentReason[];
  incomplete: CheckKey[];
}

export interface Verification {
  key: string; // owner/repo#number
  checks: VerificationChecks;
  result: AssessmentResult;
  checkedAt: string;
  cached: boolean;
}

/** NDJSON events streamed by /api/verify */
export type VerifyEvent =
  | { type: "check"; check: CheckKey; run: CheckRun<unknown> }
  | { type: "done"; verification: Verification }
  | { type: "error"; error: string };
