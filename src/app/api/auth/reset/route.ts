import { createSupabaseServer } from "@/lib/supabase/server";
import { resetSchema } from "@/lib/auth/schemas";
import { mapAuthError } from "@/lib/auth/errors";
import { fail, json, limit, readJson, sameOrigin } from "@/lib/server/http";
import { log } from "@/lib/server/log";

/** Sets a new password. Requires the recovery session created by the reset email link. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return fail(403, "Cross-site request blocked.");
  const limited = limit(req, "reset", 5);
  if (limited) return limited;
  const body = await readJson(req, resetSchema, 1024);
  if (!body.ok) return body.res;
  const supabase = await createSupabaseServer();
  if (!supabase) return fail(503, "Accounts are not configured on this server.", { code: "auth_unconfigured" });
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return fail(401, "This reset link has expired. Request a new one.", { kind: "expired" });
  const { error } = await supabase.auth.updateUser({ password: body.data.password });
  if (error) {
    const f = mapAuthError(error);
    log("warn", "auth.reset_failed", { code: error.code ?? "unknown" });
    return fail(f.status, f.message, { kind: f.kind });
  }
  log("info", "auth.password_reset");
  return json({ status: "updated" });
}
