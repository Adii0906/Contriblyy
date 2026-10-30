import { NextResponse } from "next/server";
import { discoverRequestSchema } from "@/lib/schemas";
import { discover } from "@/lib/discovery/search";
import { errorMessage, GitHubError } from "@/lib/github/client";
import { clientKey, takeToken } from "@/lib/server/rate-limit";
import { log } from "@/lib/server/log";

export async function POST(req: Request) {
  const limit = takeToken(`discover:${clientKey(req)}`, 12, 12);
  if (!limit.ok) {
    return NextResponse.json(
      { error: `Too many searches. Try again in ${limit.retryAfter}s.` },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }
  const parsed = discoverRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid search request.", issues: parsed.error.issues.slice(0, 5) }, { status: 400 });
  }

  try {
    const result = await discover(parsed.data);
    return NextResponse.json(result);
  } catch (err) {
    const status = err instanceof GitHubError && err.kind === "rate-limit" ? 429 : 502;
    log("error", "discover.failed", { error: (err as Error).message });
    return NextResponse.json(
      { error: errorMessage(err), resetAt: err instanceof GitHubError ? err.resetAt : undefined },
      { status },
    );
  }
}
