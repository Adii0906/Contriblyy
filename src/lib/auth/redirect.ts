// Pure helpers for safe post-auth redirects (open-redirect protection).

const BASE = "http://contribly.internal";

/**
 * Accepts only same-origin, absolute paths ("/app/saved?x=1"). Anything else
 * (full URLs, protocol-relative "//evil", backslash tricks, control
 * characters, javascript:) falls back to `fallback`.
 */
export function safeNext(raw: unknown, fallback = "/app"): string {
  if (typeof raw !== "string") return fallback;
  const s = raw.trim();
  if (!s || s.length > 512) return fallback;
  if (!s.startsWith("/") || s.startsWith("//") || s.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f\u007f\\]/.test(s)) return fallback;
  let u: URL;
  try {
    u = new URL(s, BASE);
  } catch {
    return fallback;
  }
  if (u.origin !== BASE) return fallback;
  // Never bounce back into the auth handlers themselves.
  if (u.pathname.startsWith("/auth/") || u.pathname.startsWith("/api/")) return fallback;
  return u.pathname + u.search + u.hash;
}

/** Only http(s) links are rendered from stored data; anything else becomes "#". */
export function safeHref(raw: unknown): string {
  if (typeof raw !== "string") return "#";
  try {
    const u = new URL(raw);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : "#";
  } catch {
    return "#";
  }
}
