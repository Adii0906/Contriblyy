import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createSupabaseServer } from "@/lib/supabase/server";
import { safeNext } from "@/lib/auth/redirect";
import { log } from "@/lib/server/log";

const TYPES: EmailOtpType[] = ["signup", "email", "recovery", "invite", "magiclink", "email_change"];

/**
 * Landing point for links in Supabase emails.
 *  - token_hash + type: recommended template, works across devices.
 *  - code: Supabase's default PKCE redirect; works in the browser that started the flow.
 * Redirects only to same-origin paths.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const tokenHash = url.searchParams.get("token_hash");
  const code = url.searchParams.get("code");
  const fallback = type === "recovery" ? "/reset-password" : "/app";
  const next = safeNext(url.searchParams.get("next"), fallback);
  const fail = (reason: string) => NextResponse.redirect(new URL(`/auth/error?reason=${reason}`, url.origin));

  const supabase = await createSupabaseServer();
  if (!supabase) return fail("unconfigured");

  if (tokenHash && type && TYPES.includes(type)) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (error) {
      log("warn", "auth.confirm_failed", { code: error.code ?? "unknown", type });
      return fail("expired");
    }
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      log("warn", "auth.exchange_failed", { code: error.code ?? "unknown" });
      return fail("expired");
    }
  } else {
    return fail("invalid");
  }

  const dest = new URL(next, url.origin);
  if (type === "signup" || type === "email") dest.searchParams.set("welcome", "1");
  return NextResponse.redirect(dest);
}
