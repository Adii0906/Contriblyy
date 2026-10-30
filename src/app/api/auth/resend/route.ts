import { createSupabaseServer } from "@/lib/supabase/server";
import { emailOnlySchema } from "@/lib/auth/schemas";
import { confirmUrl } from "@/lib/auth/site-url";
import { fail, json, limit, readJson, sameOrigin } from "@/lib/server/http";
import { log } from "@/lib/server/log";

/** Re-sends the sign-up verification email. Same answer whether or not the account exists. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return fail(403, "Cross-site request blocked.");
  const limited = limit(req, "resend", 3);
  if (limited) return limited;
  const body = await readJson(req, emailOnlySchema, 1024);
  if (!body.ok) return body.res;
  const supabase = await createSupabaseServer();
  if (!supabase) return fail(503, "Accounts are not configured on this server.", { code: "auth_unconfigured" });
  const { error } = await supabase.auth.resend({ type: "signup", email: body.data.email, options: { emailRedirectTo: confirmUrl(req, "/app") } });
  if (error) log("warn", "auth.resend_failed", { code: error.code ?? "unknown" });
  if (error?.status === 429) return fail(429, "Too many attempts. Wait a minute and try again.");
  return json({ status: "sent" });
}
