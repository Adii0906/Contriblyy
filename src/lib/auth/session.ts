import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServer } from "@/lib/supabase/server";
import { fail } from "@/lib/server/http";
import type { NextResponse } from "next/server";

export interface SessionUser {
  id: string;
  email: string | null;
  name: string | null;
  emailVerified: boolean;
}

/**
 * Verified identity from the session cookie. getClaims() validates the JWT
 * (locally with asymmetric keys, otherwise via the Auth server) and refreshes
 * it if needed. The user ID used for authorization always comes from here,
 * never from the request body.
 */
export async function requireUser(): Promise<{ ok: true; supabase: SupabaseClient; userId: string } | { ok: false; res: NextResponse }> {
  const supabase = await createSupabaseServer();
  if (!supabase) return { ok: false, res: fail(503, "Accounts are not configured on this server.", { code: "auth_unconfigured" }) };
  const { data, error } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  if (error || !sub) return { ok: false, res: fail(401, "Log in to do that. If you were signed in, your session has expired.", { code: "unauthenticated" }) };
  return { ok: true, supabase, userId: sub };
}

/** Full user record from the Auth server (authoritative, includes verification status). */
export async function currentUser(supabase: SupabaseClient): Promise<SessionUser | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  const u = data.user;
  const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
  const name = typeof meta.full_name === "string" ? meta.full_name : typeof meta.name === "string" ? meta.name : null;
  return { id: u.id, email: u.email ?? null, name, emailVerified: Boolean(u.email_confirmed_at) };
}
