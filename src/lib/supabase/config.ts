// Supabase configuration. Read only on the server (proxy and route handlers);
// none of these values are prefixed NEXT_PUBLIC_, so they never enter the
// client bundle. The app never needs the service-role key.

export interface SupabaseConfig {
  url: string;
  key: string; // publishable (or legacy anon) key; safe with RLS, still kept server-side
}

export function supabaseConfig(): SupabaseConfig | null {
  const url = process.env.SUPABASE_URL?.trim();
  const key = (process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY)?.trim();
  if (!url || !key) return null;
  return { url: url.replace(/\/+$/, ""), key };
}

export function isAuthConfigured(): boolean {
  return supabaseConfig() !== null;
}

/**
 * Auth cookies are httpOnly because all Supabase calls happen on the server:
 * browser JavaScript never needs (or gets) the access or refresh token.
 */
export const AUTH_COOKIE_OPTIONS = {
  path: "/",
  sameSite: "lax" as const,
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
};
