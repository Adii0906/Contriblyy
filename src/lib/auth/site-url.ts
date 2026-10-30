import "server-only";

/**
 * Base URL used in email links (verification, password reset).
 * Order: SITE_URL, then Vercel's preview/production URLs, then the request
 * origin in local development. Supabase also checks the final link against the
 * project's Redirect URLs allow list, so a spoofed Host cannot redirect users
 * to another domain in production.
 */
export function siteUrl(req: Request): string {
  const explicit = process.env.SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  if (process.env.VERCEL_ENV === "preview" && process.env.VERCEL_BRANCH_URL) return `https://${process.env.VERCEL_BRANCH_URL}`;
  if (process.env.VERCEL_ENV === "production" && process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return new URL(req.url).origin;
}

export function confirmUrl(req: Request, next: string): string {
  return `${siteUrl(req)}/auth/confirm?next=${encodeURIComponent(next)}`;
}
