import "server-only";

interface Bucket {
  tokens: number;
  updatedAt: number;
}

type G = { __contriblyBuckets?: Map<string, Bucket> };

/**
 * Token bucket per key (usually client IP + route). In-memory, per instance.
 * Returns retryAfter seconds when the caller is over the limit.
 */
export function takeToken(key: string, capacity: number, refillPerMinute: number): { ok: true } | { ok: false; retryAfter: number } {
  const g = globalThis as G;
  g.__contriblyBuckets ??= new Map();
  const buckets = g.__contriblyBuckets;
  const now = Date.now();
  const b = buckets.get(key) ?? { tokens: capacity, updatedAt: now };
  const refill = ((now - b.updatedAt) / 60_000) * refillPerMinute;
  b.tokens = Math.min(capacity, b.tokens + refill);
  b.updatedAt = now;
  if (b.tokens < 1) {
    buckets.set(key, b);
    const retryAfter = Math.ceil(((1 - b.tokens) / refillPerMinute) * 60);
    return { ok: false, retryAfter };
  }
  b.tokens -= 1;
  buckets.set(key, b);
  if (buckets.size > 10_000) {
    // crude cleanup of idle buckets
    for (const [k, v] of buckets) if (now - v.updatedAt > 10 * 60_000) buckets.delete(k);
  }
  return { ok: true };
}

export function clientKey(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local").slice(0, 64);
}
