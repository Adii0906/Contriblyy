import { createSupabaseServer } from "@/lib/supabase/server";
import { signupSchema } from "@/lib/auth/schemas";
import { mapAuthError } from "@/lib/auth/errors";
import { safeNext } from "@/lib/auth/redirect";
import { confirmUrl } from "@/lib/auth/site-url";
import { currentUser } from "@/lib/auth/session";
import { fail, json, limit, readJson, sameOrigin } from "@/lib/server/http";
import { log } from "@/lib/server/log";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return fail(403, "Cross-site request blocked.");
  const limited = limit(req, "signup", 5);
  if (limited) return limited;
  const body = await readJson(req, signupSchema, 4096);
  if (!body.ok) return body.res;
  const supabase = await createSupabaseServer();
  if (!supabase) return fail(503, "Accounts are not configured on this server.", { code: "auth_unconfigured" });

  const { name, email, password, next } = body.data;
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: confirmUrl(req, safeNext(next, "/app")),
      data: name ? { full_name: name } : undefined,
    },
  });
  if (error) {
    const f = mapAuthError(error);
    log("warn", "auth.signup_failed", { code: error.code ?? "unknown" });
    return fail(f.status, f.message, { kind: f.kind });
  }
  log("info", "auth.signup", { confirmed: Boolean(data.session) });
  // With email confirmation on, Supabase returns no session (and does not reveal
  // whether the address was already registered). Treat both cases the same.
  if (!data.session) return json({ status: "verify-email" });
  return json({ status: "signed-in", user: await currentUser(supabase) });
}
