import "server-only";
import { isIP } from "node:net";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { AUTH_COOKIE_OPTIONS, supabaseConfig } from "./config";

/**
 * Per-request Supabase client for route handlers. Uses the caller's session
 * cookies, so every database query runs as that user and RLS applies.
 * Returns null when Supabase is not configured. When a valid client IP is
 * supplied, a server-only secret key enables Supabase Auth IP forwarding.
 */
export async function createSupabaseServer(forwardedIp?: string): Promise<SupabaseClient | null> {
  // Always request-time: configuration is read from the runtime environment and
  // responses depend on the caller's cookies, so nothing here may be prerendered.
  await connection();
  const cfg = supabaseConfig();
  if (!cfg) return null;
  const store = await cookies();
  const validForwardedIp = forwardedIp && isIP(forwardedIp) ? forwardedIp : undefined;
  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim();
  const useIpForwarding = Boolean(validForwardedIp && secretKey?.startsWith("sb_secret_"));
  const key = useIpForwarding && secretKey ? secretKey : cfg.key;
  return createServerClient(cfg.url, key, {
    ...(useIpForwarding && validForwardedIp ? { global: { headers: { "sb-forwarded-for": validForwardedIp } } } : {}),
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
