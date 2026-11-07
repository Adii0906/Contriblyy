import { createSupabaseServer } from "@/lib/supabase/server";
import { loginSchema } from "@/lib/auth/schemas";
import { mapAuthError } from "@/lib/auth/errors";
import { currentUser } from "@/lib/auth/session";
import { fail, json, limit, readJson, sameOrigin } from "@/lib/server/http";
import { log } from "@/lib/server/log";
import { clientKey } from "@/lib/server/rate-limit";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return fail(403, "Cross-site request blocked.");
  const body = await readJson(req, loginSchema, 4096);
  if (!body.ok) return body.res;
  // Per IP, and per IP+email to slow targeted guessing. Supabase Auth applies its own limits too.
  const limited = limit(req, "login", 20) ?? limit(req, "login-email", 6, body.data.email.toLowerCase());
  if (limited) return limited;
  const supabase = await createSupabaseServer(clientKey(req));
  if (!supabase) return fail(503, "Accounts are not configured on this server.", { code: "auth_unconfigured" });

  const { error } = await supabase.auth.signInWithPassword({ email: body.data.email, password: body.data.password });
  if (error) {
    const f = mapAuthError(error);
    log("warn", "auth.login_failed", { code: error.code ?? "unknown" });
    return fail(f.status, f.message, { kind: f.kind });
  }
  log("info", "auth.login");
  return json({ status: "signed-in", user: await currentUser(supabase) });
}
