// Validation and row mapping for saved issues. Pure (no server imports).
import { z } from "zod";
import type { IssueSummary, Verification } from "@/lib/types";

const ghName = z.string().regex(/^[A-Za-z0-9_.-]{1,100}$/);
const iso = z.string().max(40);

export const issueSummarySchema = z.object({
  id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  number: z.number().int().positive().max(100_000_000),
  title: z.string().trim().min(1).max(512),
  url: z.string().max(512).regex(/^https:\/\/github\.com\/[^/]+\/[^/]+\/issues\/\d+$/, "Only GitHub issue links can be saved."),
  bodyExcerpt: z.string().max(400),
  bodyText: z.string().max(4000),
  bodyLength: z.number().int().min(0).max(1_000_000),
  codeBlocks: z.number().int().min(0).max(10_000),
  taskCount: z.number().int().min(0).max(10_000),
  labels: z.array(z.object({ name: z.string().max(100), color: z.string().max(12) })).max(30),
  comments: z.number().int().min(0).max(1_000_000),
  createdAt: iso,
  updatedAt: iso,
  author: z.string().max(100).nullable(),
  assignees: z.array(z.string().max(100)).max(20),
  repo: z.object({ owner: ghName, name: ghName, fullName: z.string().max(201), url: z.string().max(300).regex(/^https:\/\/github\.com\//) }),
  foundBy: z.array(z.string().max(80)).max(20),
});

/**
 * Verification snapshots are stored as the user saw them, so they are
 * validated for shape and size, not re-derived. Only the owner can read them
 * (RLS), and links inside are sanitised when rendered.
 */
export const verificationSchema = z
  .object({
    key: z.string().max(220),
    checkedAt: iso,
    cached: z.boolean(),
    result: z.object({ assessment: z.enum(["promising", "needs-review", "likely-unavailable"]), reasons: z.array(z.unknown()).max(40), incomplete: z.array(z.string()).max(6) }).passthrough(),
    checks: z.record(z.string(), z.unknown()),
  })
  .passthrough()
  .refine((v) => JSON.stringify(v).length < 60_000, "Verification snapshot is too large.");

export const saveRequestSchema = z.object({ issue: issueSummarySchema, verification: verificationSchema.optional() });
export const deleteRequestSchema = z.object({ githubIssueId: z.number().int().positive() });
export const importRequestSchema = z.object({ items: z.array(saveRequestSchema).min(1).max(50) });

export interface SavedIssueRow {
  github_issue_id: number | string;
  repo_owner: string;
  repo_name: string;
  issue_number: number;
  title: string;
  url: string;
  snapshot: unknown;
  verification: unknown;
  created_at: string;
  updated_at?: string;
}

export interface SavedIssueDTO {
  issue: IssueSummary;
  verification?: Verification;
  savedAt: string;
}

/** Columns the client is allowed to write. user_id is never included: the DB sets it from auth.uid(). */
export function toInsertRow(issue: IssueSummary, verification?: Verification) {
  return {
    github_issue_id: issue.id,
    repo_owner: issue.repo.owner,
    repo_name: issue.repo.name,
    issue_number: issue.number,
    title: issue.title,
    url: issue.url,
    snapshot: issue,
    verification: verification ?? null,
  };
}

export function fromRow(row: SavedIssueRow): SavedIssueDTO | null {
  const snap = issueSummarySchema.safeParse(row.snapshot);
  // Fall back to the indexed columns if an old snapshot no longer matches the schema.
  const issue: IssueSummary = snap.success
    ? snap.data
    : {
        id: Number(row.github_issue_id),
        number: row.issue_number,
        title: row.title,
        url: row.url,
        bodyExcerpt: "",
        bodyText: "",
        bodyLength: 0,
        codeBlocks: 0,
        taskCount: 0,
        labels: [],
        comments: 0,
        createdAt: row.created_at,
        updatedAt: row.created_at,
        author: null,
        assignees: [],
        repo: { owner: row.repo_owner, name: row.repo_name, fullName: `${row.repo_owner}/${row.repo_name}`, url: `https://github.com/${row.repo_owner}/${row.repo_name}` },
        foundBy: [],
      };
  const ver = verificationSchema.safeParse(row.verification);
  return { issue, verification: ver.success ? (ver.data as unknown as Verification) : undefined, savedAt: row.created_at };
}
