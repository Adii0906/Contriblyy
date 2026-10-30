import { NextResponse } from "next/server";
import { ghRest, hasToken, isTestMode } from "@/lib/github/client";

interface RateResp {
  resources: Record<string, { limit: number; remaining: number; reset: number }>;
}

/** Reports whether a token is configured and the current GitHub budget. */
export async function POST() {
  try {
    const r = await ghRest<RateResp>("/rate_limit", { timeoutMs: 6000 });
    const pick = (k: string) => {
      const x = r.data.resources[k];
      return x ? { limit: x.limit, remaining: x.remaining, resetAt: new Date(x.reset * 1000).toISOString() } : null;
    };
    return NextResponse.json({ ok: true, mode: isTestMode() ? "test" : "live", token: hasToken(), core: pick("core"), search: pick("search"), graphql: pick("graphql") });
  } catch (err) {
    return NextResponse.json({ ok: false, mode: isTestMode() ? "test" : "live", token: hasToken(), error: (err as Error).message }, { status: 502 });
  }
}
