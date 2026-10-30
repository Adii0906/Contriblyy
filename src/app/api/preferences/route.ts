import { requireUser } from "@/lib/auth/session";
import { preferencesSchema } from "@/lib/preferences";
import { fail, json, limit, readJson, sameOrigin } from "@/lib/server/http";
import { log } from "@/lib/server/log";

interface PrefRow {
  skills: unknown;
  weekly_hours: string;
  task_scope: string;
  filters: unknown;
  auto_verify: boolean;
  updated_at: string;
}

/** The signed-in user's preferences, or null if they have none yet. */
export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.res;
  const { data, error } = await auth.supabase.from("user_preferences").select("skills, weekly_hours, task_scope, filters, auto_verify, updated_at").limit(1);
  if (error) {
    log("error", "prefs.load_failed", { code: error.code });
    return fail(502, "Could not load your preferences.");
  }
  const row = (data as PrefRow[])[0];
  if (!row) return json({ preferences: null });
  const parsed = preferencesSchema.safeParse({ skills: row.skills, time: row.weekly_hours, scope: row.task_scope, autoVerify: row.auto_verify, filters: row.filters ?? {} });
  return json({ preferences: parsed.success ? { ...parsed.data, updatedAt: row.updated_at } : null });
}

/** Create or replace the signed-in user's preferences. */
export async function PUT(req: Request) {
  if (!sameOrigin(req)) return fail(403, "Cross-site request blocked.");
  const limited = limit(req, "prefs", 60);
  if (limited) return limited;
  const auth = await requireUser();
  if (!auth.ok) return auth.res;
  const body = await readJson(req, preferencesSchema, 24_000);
  if (!body.ok) return body.res;
  const p = body.data;
  const { error } = await auth.supabase
    .from("user_preferences")
    .upsert({ skills: p.skills, weekly_hours: p.time, task_scope: p.scope, filters: p.filters, auto_verify: p.autoVerify }, { onConflict: "user_id" });
  if (error) {
    log("error", "prefs.save_failed", { code: error.code });
    return fail(502, "Could not save your preferences.");
  }
  return json({ status: "saved" });
}
