import { createSupabaseServer } from "@/lib/supabase/server";
import { mapAuthError } from "@/lib/auth/errors";
import { emailOnlySchema } from "@/lib/auth/schemas";
import { confirmUrl } from "@/lib/auth/site-url";
import { fail, json, limit, readJson, sameOrigin } from "@/lib/server/http";
import { log } from "@/lib/server/log";
import { clientKey } from "@/lib/server/rate-limit";

/** Always answers the same way so the response never reveals whether an account exists. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return fail(403, "Cross-site request blocked.");
  const limited = limit(req, "forgot", 4);
  if (limited) return limited;
  const body = await readJson(req, emailOnlySchema, 1024);
  if (!body.ok) return body.res;
  const supabase = await createSupabaseServer(clientKey(req));
  if (!supabase) return fail(503, "Accounts are not configured on this server.", { code: "auth_unconfigured" });
  const { error } = await supabase.auth.resetPasswordForEmail(body.data.email, { redirectTo: confirmUrl(req, "/reset-password") });
  if (error) log("warn", "auth.forgot_failed", { code: error.code ?? "unknown" });
  if (error) {
    const failure = mapAuthError(error);
    if (failure.kind === "rate") return fail(failure.status, failure.message, { kind: failure.kind });
  }
  return json({ status: "sent" });
}
