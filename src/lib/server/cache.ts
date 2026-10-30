import "server-only";

interface Entry<T> {
  value: T;
  expiresAt: number;
  storedAt: number;
}

/**
 * Small in-process TTL + LRU cache with in-flight request deduplication.
 * Good enough for a single Node instance. For multiple instances, swap the
 * Map for Redis/Upstash behind the same interface.
 */
export class TtlCache<T> {
  private map = new Map<string, Entry<T>>();
  private inflight = new Map<string, Promise<T>>();

  constructor(private readonly max: number) {}

  get(key: string): { value: T; storedAt: number } | undefined {
    const e = this.map.get(key);
    if (!e) return undefined;
    if (Date.now() > e.expiresAt) {
      this.map.delete(key);
      return undefined;
    }
    // refresh LRU position
    this.map.delete(key);
    this.map.set(key, e);
    return { value: e.value, storedAt: e.storedAt };
  }

  set(key: string, value: T, ttlMs: number): void {
    if (this.map.size >= this.max) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
    const now = Date.now();
    this.map.set(key, { value, expiresAt: now + ttlMs, storedAt: now });
  }

  delete(key: string): void {
    this.map.delete(key);
  }

  /**
   * Return a cached value, or run `loader` once even if many callers ask for the
   * same key at the same time. Failed loads are not cached.
   */
  async getOrLoad(
    key: string,
    ttlMs: number,
    loader: () => Promise<T>,
    opts: { force?: boolean; shouldCache?: (v: T) => boolean } = {},
  ): Promise<{ value: T; cached: boolean; storedAt: number }> {
    if (!opts.force) {
      const hit = this.get(key);
      if (hit) return { value: hit.value, cached: true, storedAt: hit.storedAt };
    }
    const pending = this.inflight.get(key);
    if (pending) {
      const value = await pending;
      return { value, cached: false, storedAt: Date.now() };
    }
    const p = loader();
    this.inflight.set(key, p);
    try {
      const value = await p;
      if (!opts.shouldCache || opts.shouldCache(value)) this.set(key, value, ttlMs);
      return { value, cached: false, storedAt: Date.now() };
    } finally {
      this.inflight.delete(key);
    }
  }
}

type GlobalCaches = { __contriblyCaches?: Map<string, TtlCache<unknown>> };

/** Named caches survive dev hot reloads by living on globalThis. */
export function namedCache<T>(name: string, max = 2000): TtlCache<T> {
  const g = globalThis as GlobalCaches;
  g.__contriblyCaches ??= new Map();
  let c = g.__contriblyCaches.get(name);
  if (!c) {
    c = new TtlCache<unknown>(max);
    g.__contriblyCaches.set(name, c);
  }
  return c as TtlCache<T>;
}
