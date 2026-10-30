import { requireUser } from "@/lib/auth/session";
import { fail, json, limit, readJson, sameOrigin } from "@/lib/server/http";
import { log } from "@/lib/server/log";
import { deleteRequestSchema, fromRow, saveRequestSchema, toInsertRow, type SavedIssueRow } from "@/lib/saved/schemas";
import type { IssueSummary, Verification } from "@/lib/types";

const COLUMNS = "github_issue_id, repo_owner, repo_name, issue_number, title, url, snapshot, verification, created_at";

/** List the signed-in user's saved issues. RLS limits rows to the caller. */
export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.res;
  const { data, error } = await auth.supabase.from("saved_issues").select(COLUMNS).order("created_at", { ascending: false }).limit(500);
  if (error) {
    log("error", "saved.list_failed", { code: error.code });
    return fail(502, "Could not load your saved issues. Try again.");
  }
  const items = (data as SavedIssueRow[]).map(fromRow).filter(Boolean);
  return json({ items });
}

/** Save an issue. Idempotent: saving an already-saved issue refreshes its snapshot. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return fail(403, "Cross-site request blocked.");
  const limited = limit(req, "save", 60);
  if (limited) return limited;
  const auth = await requireUser();
  if (!auth.ok) return auth.res;
  const body = await readJson(req, saveRequestSchema, 80_000);
  if (!body.ok) return body.res;

  const issue = body.data.issue as IssueSummary;
  const verification = body.data.verification as Verification | undefined;
  const row = toInsertRow(issue, verification);

  // Insert, ignoring duplicates (unique on user_id + github_issue_id)...
  const ins = await auth.supabase.from("saved_issues").upsert(row, { onConflict: "user_id,github_issue_id", ignoreDuplicates: true }).select(COLUMNS);
  if (ins.error) {
    if (ins.error.code === "54000") return fail(409, "You have reached the limit of 500 saved issues.");
    log("error", "saved.insert_failed", { code: ins.error.code });
    return fail(502, "Could not save this issue. Try again.");
  }
  let saved = (ins.data as SavedIssueRow[])[0];
  if (!saved) {
    // ...and if it already existed, update only the content columns.
    const upd = await auth.supabase
      .from("saved_issues")
      .update({ title: row.title, snapshot: row.snapshot, ...(verification ? { verification } : {}) })
      .eq("github_issue_id", issue.id)
      .select(COLUMNS);
    if (upd.error) {
      log("error", "saved.update_failed", { code: upd.error.code });
      return fail(502, "Could not save this issue. Try again.");
    }
    saved = (upd.data as SavedIssueRow[])[0];
  }
  if (!saved) return fail(502, "Could not save this issue. Try again.");
  return json({ item: fromRow(saved), created: (ins.data as SavedIssueRow[]).length > 0 }, 201);
}

/** Remove a saved issue. RLS guarantees it can only be the caller's own row. */
export async function DELETE(req: Request) {
  if (!sameOrigin(req)) return fail(403, "Cross-site request blocked.");
  const limited = limit(req, "unsave", 60);
  if (limited) return limited;
  const auth = await requireUser();
  if (!auth.ok) return auth.res;
  const body = await readJson(req, deleteRequestSchema, 512);
  if (!body.ok) return body.res;
  const { error, count } = await auth.supabase.from("saved_issues").delete({ count: "exact" }).eq("github_issue_id", body.data.githubIssueId);
  if (error) {
    log("error", "saved.delete_failed", { code: error.code });
    return fail(502, "Could not remove this issue. Try again.");
  }
  return json({ removed: count ?? 0 });
}
