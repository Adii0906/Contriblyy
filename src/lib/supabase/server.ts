import "server-only";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { AUTH_COOKIE_OPTIONS, supabaseConfig } from "./config";

/**
 * Per-request Supabase client for route handlers. Uses the caller's session
 * cookies, so every database query runs as that user and RLS applies.
 * Returns null when Supabase is not configured.
 */
export async function createSupabaseServer(): Promise<SupabaseClient | null> {
  // Always request-time: configuration is read from the runtime environment and
  // responses depend on the caller's cookies, so nothing here may be prerendered.
  await connection();
  const cfg = supabaseConfig();
  if (!cfg) return null;
  const store = await cookies();
  return createServerClient(cfg.url, cfg.key, {
    cookieOptions: AUTH_COOKIE_OPTIONS,
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, { ...options, ...AUTH_COOKIE_OPTIONS });
        } catch {
          // Called from a context that cannot set cookies; proxy.ts refreshes sessions instead.
        }
      },
    },
  });
}
