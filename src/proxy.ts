import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { AUTH_COOKIE_OPTIONS, supabaseConfig } from "@/lib/supabase/config";

/**
 * Refreshes the Supabase session on navigation and authenticated API calls,
 * writing rotated tokens back as httpOnly cookies. It does not gate pages:
 * guest browsing stays available, and protected API routes check the session
 * themselves.
 */
export async function proxy(request: NextRequest) {
  const cfg = supabaseConfig();
  if (!cfg) return NextResponse.next({ request });

  let response = NextResponse.next({ request });
  const supabase = createServerClient(cfg.url, cfg.key, {
    cookieOptions: AUTH_COOKIE_OPTIONS,
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list, headers) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, { ...options, ...AUTH_COOKIE_OPTIONS });
        for (const [k, v] of Object.entries(headers ?? {})) response.headers.set(k, v);
      },
    },
  });

  // Validates the JWT and refreshes it when close to expiry. Must run before
  // any rendering so that the refreshed cookies reach the route.
  try {
    await supabase.auth.getClaims();
  } catch {
    // Auth server unreachable: continue as signed out rather than failing the page.
  }
  return response;
}

export const config = {
  matcher: [
    // Skip static assets and the public GitHub endpoints, which never use the session.
    "/((?!_next/static|_next/image|favicon.ico|api/discover|api/verify|api/status|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)",
  ],
};
