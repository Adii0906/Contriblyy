import { NextResponse } from "next/server";
import { verifyRequestSchema } from "@/lib/schemas";
import { runVerification } from "@/lib/verify/run";
import { clientKey, takeToken } from "@/lib/server/rate-limit";
import type { VerifyEvent } from "@/lib/types";

/**
 * Streams NDJSON: one `check` event per finished check, then a `done` event
 * with the final assessment. The UI resolves each indicator only when its
 * event arrives.
 */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }
  const parsed = verifyRequestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid verification request." }, { status: 400 });

  // Forced rechecks are more expensive, so they get a tighter budget.
  const key = clientKey(req);
  const limit = parsed.data.force ? takeToken(`recheck:${key}`, 10, 10) : takeToken(`verify:${key}`, 90, 90);
  if (!limit.ok) {
    return NextResponse.json(
      { error: `Too many verification requests. Try again in ${limit.retryAfter}s.` },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (ev: VerifyEvent) => controller.enqueue(encoder.encode(JSON.stringify(ev) + "\n"));
      try {
        const verification = await runVerification(parsed.data, {
          force: parsed.data.force,
          onCheck: (check, run) => send({ type: "check", check, run }),
        });
        send({ type: "done", verification });
      } catch (err) {
        send({ type: "error", error: (err as Error).message || "Verification failed" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
