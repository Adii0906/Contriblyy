import { requireUser } from "@/lib/auth/session";
import { fail, json, limit, readJson, sameOrigin } from "@/lib/server/http";
import { log } from "@/lib/server/log";
import { importRequestSchema, toInsertRow } from "@/lib/saved/schemas";
import type { IssueSummary, Verification } from "@/lib/types";

/** One-time import of issues saved in this browser by the earlier guest version. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return fail(403, "Cross-site request blocked.");
  const limited = limit(req, "import", 5);
  if (limited) return limited;
  const auth = await requireUser();
  if (!auth.ok) return auth.res;
  const body = await readJson(req, importRequestSchema, 1_000_000);
  if (!body.ok) return body.res;
  const rows = body.data.items.map((i) => toInsertRow(i.issue as IssueSummary, i.verification as Verification | undefined));
  const { data, error } = await auth.supabase.from("saved_issues").upsert(rows, { onConflict: "user_id,github_issue_id", ignoreDuplicates: true }).select("github_issue_id");
  if (error) {
    if (error.code === "54000") return fail(409, "You have reached the limit of 500 saved issues.");
    log("error", "saved.import_failed", { code: error.code });
    return fail(502, "Could not import your saved issues. Try again.");
  }
  return json({ imported: data?.length ?? 0, skipped: rows.length - (data?.length ?? 0) });
}
