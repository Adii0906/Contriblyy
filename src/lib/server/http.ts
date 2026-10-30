import "server-only";
import { NextResponse } from "next/server";
import type { z } from "zod";
import { clientKey, takeToken } from "./rate-limit";

export const json = (body: unknown, status = 200, headers?: HeadersInit) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });

export const fail = (status: number, error: string, extra: Record<string, unknown> = {}) => json({ error, ...extra }, status);

/**
 * Rejects cross-site state-changing requests. Auth cookies are SameSite=Lax,
 * and this adds an Origin / Fetch-Metadata check on top.
 */
export function sameOrigin(req: Request): boolean {
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return false;
  const origin = req.headers.get("origin");
  if (!origin) return true; // same-origin fetches from older browsers, curl in dev
  try {
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** Reads a JSON body with a hard size cap and validates it with Zod. */
export async function readJson<T extends z.ZodTypeAny>(req: Request, schema: T, maxBytes = 16_384): Promise<{ ok: true; data: z.infer<T> } | { ok: false; res: NextResponse }> {
  if (!(req.headers.get("content-type") ?? "").includes("application/json")) return { ok: false, res: fail(415, "Send JSON.") };
  const text = await req.text();
  if (text.length > maxBytes) return { ok: false, res: fail(413, "Request is too large.") };
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return { ok: false, res: fail(400, "Request body must be JSON.") };
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return { ok: false, res: fail(400, parsed.error.issues[0]?.message ?? "Invalid request.", { field: parsed.error.issues[0]?.path.join(".") }) };
  return { ok: true, data: parsed.data };
}

export function limit(req: Request, bucket: string, perMinute: number, extraKey = ""): NextResponse | null {
  const r = takeToken(`${bucket}:${clientKey(req)}:${extraKey}`, perMinute, perMinute);
  if (r.ok) return null;
  return fail(429, `Too many attempts. Try again in ${r.retryAfter}s.`, { retryAfter: r.retryAfter });
}
