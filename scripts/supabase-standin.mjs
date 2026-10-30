#!/usr/bin/env node
// =============================================================================
// TEST-ONLY SUPABASE STAND-IN. NOT A SECURITY BOUNDARY. NEVER DEPLOY.
//
// Implements the small part of the Supabase Auth (GoTrue) and PostgREST HTTP
// APIs that Contribly uses, so the full auth + saved-issues journey can run
// end to end without network access to supabase.com.
//
//  * Auth: signup, password login, refresh, getUser, updateUser, logout,
//    verify (token_hash), recover, resend. Access tokens are HS256 JWTs.
//    Emails are not sent; they are written to an in-memory outbox that tests
//    read from GET /__test/outbox?email=...
//  * REST: select / insert / upsert / update / delete with eq filters for
//    saved_issues and user_preferences only. Every query runs on a REAL
//    PostgreSQL database inside a transaction with `SET LOCAL ROLE
//    authenticated` (or anon) and request.jwt.claims set, exactly like
//    PostgREST, so the migration's Row Level Security is what decides access.
//
// Usage: node scripts/supabase-standin.mjs --db postgres://... [--port 54321]
// =============================================================================

import http from "node:http";
import crypto from "node:crypto";
import pg from "pg";

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, v, i, a) => (v.startsWith("--") ? [...acc, [v.slice(2), a[i + 1]]] : acc), []));
const PORT = Number(args.port ?? process.env.STANDIN_PORT ?? 54321);
const DB = args.db ?? process.env.STANDIN_DB_URL;
const SECRET = process.env.STANDIN_JWT_SECRET ?? "standin-test-secret-not-for-production";
export const STANDIN_KEY = "standin-publishable-key";
const ACCESS_TTL = Number(process.env.STANDIN_ACCESS_TTL ?? 3600);
const REQUIRE_CONFIRM = process.env.STANDIN_CONFIRM !== "0";
if (!DB) {
  console.error("[standin] --db <postgres url> is required");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: DB, max: 8 });
await pool.query(`alter table auth.users add column if not exists last_sign_in_at timestamptz`);

/* ----------------------------- auth state ----------------------------- */

const sessions = new Map(); // sessionId -> { userId, revoked }
const refreshTokens = new Map(); // token -> { sessionId, used }
const otps = new Map(); // tokenHash -> { userId, type, exp, used }
const outbox = [];

const b64url = (b) => Buffer.from(b).toString("base64url");
function signJwt(payload) {
  const h = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const p = b64url(JSON.stringify(payload));
  const s = crypto.createHmac("sha256", SECRET).update(`${h}.${p}`).digest("base64url");
  return `${h}.${p}.${s}`;
}
function verifyJwt(token) {
  const [h, p, s] = String(token).split(".");
  if (!h || !p || !s) return null;
  const expect = crypto.createHmac("sha256", SECRET).update(`${h}.${p}`).digest("base64url");
  if (expect.length !== s.length || !crypto.timingSafeEqual(Buffer.from(expect), Buffer.from(s))) return null;
  const claims = JSON.parse(Buffer.from(p, "base64url").toString());
  if (claims.exp * 1000 < Date.now()) return { expired: true };
  const sess = sessions.get(claims.session_id);
  if (!sess || sess.revoked) return { revoked: true };
  return { claims };
}

function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString("hex");
  return `${salt}:${crypto.scryptSync(pw, salt, 32).toString("hex")}`;
}
function checkPassword(pw, stored) {
  if (!stored) return false;
  const [salt, hash] = stored.split(":");
  const got = crypto.scryptSync(pw, salt, 32);
  return crypto.timingSafeEqual(got, Buffer.from(hash, "hex"));
}

function userJson(u) {
  return {
    id: u.id,
    aud: "authenticated",
    role: "authenticated",
    email: u.email,
    email_confirmed_at: u.email_confirmed_at,
    confirmed_at: u.email_confirmed_at,
    last_sign_in_at: u.last_sign_in_at,
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: u.raw_user_meta_data ?? {},
    identities: [{ id: u.id, user_id: u.id, provider: "email", identity_data: { email: u.email, sub: u.id } }],
    created_at: u.created_at,
    updated_at: u.updated_at,
    is_anonymous: false,
  };
}

async function createSession(user) {
  const sessionId = crypto.randomUUID();
  sessions.set(sessionId, { userId: user.id, revoked: false });
  await pool.query("update auth.users set last_sign_in_at = now() where id = $1", [user.id]);
  return sessionFor(user, sessionId);
}
function sessionFor(user, sessionId) {
  const now = Math.floor(Date.now() / 1000);
  const access = signJwt({ sub: user.id, email: user.email, role: "authenticated", aud: "authenticated", iat: now, exp: now + ACCESS_TTL, session_id: sessionId, iss: `http://localhost:${PORT}/auth/v1`, is_anonymous: false, user_metadata: user.raw_user_meta_data ?? {} });
  const refresh = crypto.randomBytes(24).toString("base64url");
  refreshTokens.set(refresh, { sessionId, used: false });
  return { access_token: access, token_type: "bearer", expires_in: ACCESS_TTL, expires_at: now + ACCESS_TTL, refresh_token: refresh, user: userJson(user) };
}

function issueOtp(user, type, redirectTo) {
  const tokenHash = crypto.randomBytes(20).toString("hex");
  otps.set(tokenHash, { userId: user.id, type, exp: Date.now() + 3600_000, used: false });
  let base;
  try {
    base = new URL(redirectTo).origin;
  } catch {
    base = "http://localhost:3000";
  }
  // Mirrors the recommended email template: {{ .SiteURL }}/auth/confirm?token_hash=...&type=...
  const link = `${base}/auth/confirm?token_hash=${tokenHash}&type=${type === "recovery" ? "recovery" : "email"}`;
  outbox.push({ to: user.email, type, link, at: new Date().toISOString() });
}

const userByEmail = async (email) => (await pool.query("select * from auth.users where lower(email) = lower($1)", [email])).rows[0];
const userById = async (id) => (await pool.query("select * from auth.users where id = $1", [id])).rows[0];

/* ----------------------------- http utils ----------------------------- */

function send(res, status, body, headers = {}) {
  res.writeHead(status, { "Content-Type": "application/json", "x-supabase-api-version": "2024-01-01", ...headers });
  res.end(body === undefined ? "" : JSON.stringify(body));
}
const authErr = (res, status, code, msg) => send(res, status, { code, error_code: code, msg, message: msg });
async function readBody(req) {
  let raw = "";
  for await (const c of req) raw += c;
  return raw ? JSON.parse(raw) : {};
}
function bearer(req) {
  const h = req.headers.authorization ?? "";
  return h.startsWith("Bearer ") ? h.slice(7) : null;
}

/* ----------------------------- auth routes ----------------------------- */

async function auth(req, res, url) {
  const path = url.pathname.replace(/^\/auth\/v1/, "");
  const redirectTo = url.searchParams.get("redirect_to") ?? "http://localhost:3000";

  if (path === "/settings") return send(res, 200, { external: { email: true }, mailer_autoconfirm: !REQUIRE_CONFIRM });

  if (path === "/signup" && req.method === "POST") {
    const b = await readBody(req);
    if (!b.email || !b.password) return authErr(res, 400, "validation_failed", "Email and password are required");
    if (String(b.password).length < 8) return send(res, 422, { code: "weak_password", msg: "Password should be at least 8 characters.", weak_password: { reasons: ["length"] } });
    const existing = await userByEmail(b.email);
    if (existing) {
      if (!REQUIRE_CONFIRM) return authErr(res, 422, "user_already_exists", "User already registered");
      // Like Supabase with confirmations on: respond with an obfuscated user, send nothing.
      return send(res, 200, { id: crypto.randomUUID(), email: b.email, aud: "authenticated", role: "authenticated", identities: [], user_metadata: {}, app_metadata: {}, created_at: new Date().toISOString() });
    }
    const { rows } = await pool.query("insert into auth.users (email, encrypted_password, raw_user_meta_data, email_confirmed_at) values ($1, $2, $3, $4) returning *", [b.email, hashPassword(b.password), b.data ?? {}, REQUIRE_CONFIRM ? null : new Date()]);
    const user = rows[0];
    if (REQUIRE_CONFIRM) {
      issueOtp(user, "signup", redirectTo);
      return send(res, 200, userJson(user));
    }
    return send(res, 200, await createSession(user));
  }

  if (path === "/token" && req.method === "POST") {
    const grant = url.searchParams.get("grant_type");
    const b = await readBody(req);
    if (grant === "password") {
      const user = await userByEmail(b.email ?? "");
      if (!user || !checkPassword(String(b.password ?? ""), user.encrypted_password)) return authErr(res, 400, "invalid_credentials", "Invalid login credentials");
      if (!user.email_confirmed_at) return authErr(res, 400, "email_not_confirmed", "Email not confirmed");
      return send(res, 200, await createSession(user));
    }
    if (grant === "refresh_token") {
      const rt = refreshTokens.get(b.refresh_token);
      if (!rt) return authErr(res, 400, "refresh_token_not_found", "Invalid Refresh Token: Refresh Token Not Found");
      if (rt.used) return authErr(res, 400, "refresh_token_already_used", "Invalid Refresh Token: Already Used");
      const sess = sessions.get(rt.sessionId);
      if (!sess || sess.revoked) return authErr(res, 400, "session_not_found", "Session not found");
      rt.used = true;
      return send(res, 200, sessionFor(await userById(sess.userId), rt.sessionId));
    }
    return authErr(res, 400, "unsupported_grant_type", "Unsupported grant type");
  }

  if (path === "/verify" && req.method === "POST") {
    const b = await readBody(req);
    const otp = otps.get(b.token_hash);
    if (!otp || otp.used || otp.exp < Date.now()) return authErr(res, 403, "otp_expired", "Email link is invalid or has expired");
    otp.used = true;
    if (otp.type === "signup") await pool.query("update auth.users set email_confirmed_at = coalesce(email_confirmed_at, now()) where id = $1", [otp.userId]);
    return send(res, 200, await createSession(await userById(otp.userId)));
  }

  if ((path === "/recover" || path === "/resend") && req.method === "POST") {
    const b = await readBody(req);
    const user = await userByEmail(b.email ?? "");
    if (user) {
      if (path === "/recover") issueOtp(user, "recovery", redirectTo);
      else if (!user.email_confirmed_at) issueOtp(user, "signup", redirectTo);
    }
    return send(res, 200, {});
  }

  if (path === "/user") {
    const v = verifyJwt(bearer(req));
    if (!v) return authErr(res, 403, "bad_jwt", "invalid JWT");
    if (v.expired) return authErr(res, 403, "bad_jwt", "token is expired");
    if (v.revoked) return authErr(res, 403, "session_not_found", "Session from session_id claim in JWT does not exist");
    const user = await userById(v.claims.sub);
    if (!user) return authErr(res, 403, "user_not_found", "User from sub claim in JWT does not exist");
    if (req.method === "GET") return send(res, 200, userJson(user));
    if (req.method === "PUT") {
      const b = await readBody(req);
      if (b.password) {
        if (String(b.password).length < 8) return send(res, 422, { code: "weak_password", msg: "Password should be at least 8 characters.", weak_password: { reasons: ["length"] } });
        if (checkPassword(b.password, user.encrypted_password)) return authErr(res, 422, "same_password", "New password should be different from the old password.");
        await pool.query("update auth.users set encrypted_password = $2, updated_at = now() where id = $1", [user.id, hashPassword(b.password)]);
      }
      return send(res, 200, userJson(await userById(user.id)));
    }
  }

  if (path === "/logout" && req.method === "POST") {
    const v = verifyJwt(bearer(req));
    if (v?.claims) sessions.get(v.claims.session_id).revoked = true;
    return send(res, 204);
  }

  return authErr(res, 404, "not_found", "Not found");
}

/* ----------------------------- REST routes ----------------------------- */

const TABLES = {
  saved_issues: { cols: ["id", "user_id", "github_issue_id", "repo_owner", "repo_name", "issue_number", "title", "url", "snapshot", "verification", "created_at", "updated_at"], json: ["snapshot", "verification"] },
  user_preferences: { cols: ["user_id", "skills", "weekly_hours", "task_scope", "filters", "auto_verify", "updated_at"], json: ["skills", "filters"] },
};
const RESERVED = new Set(["select", "order", "limit", "on_conflict", "columns", "offset"]);
const q = (c) => `"${c}"`;

function restError(res, e, role) {
  const map = { "42501": role === "anon" ? 401 : 403, "23505": 409, "23514": 400, "23503": 409, "54000": 400, "22P02": 400 };
  send(res, map[e.code] ?? 400, { code: e.code, details: e.detail ?? null, hint: e.hint ?? null, message: e.message });
}

async function rest(req, res, url) {
  const table = url.pathname.replace(/^\/rest\/v1\//, "");
  const def = TABLES[table];
  if (!def) return send(res, 404, { code: "PGRST205", message: `Could not find the table 'public.${table}'` });
  const token = bearer(req);
  let role = "anon";
  let claims = { role: "anon" };
  if (token && token !== STANDIN_KEY) {
    const v = verifyJwt(token);
    if (!v || v.expired || v.revoked) return send(res, 401, { code: "PGRST301", message: "JWT expired" });
    role = "authenticated";
    claims = v.claims;
  }
  const prefer = String(req.headers.prefer ?? "");
  const p = url.searchParams;
  const valid = (c) => def.cols.includes(c);
  const selectCols = (p.get("select") ?? "*").split(",").map((s) => s.trim()).filter(Boolean);
  if (selectCols.some((c) => c !== "*" && !valid(c))) return send(res, 400, { code: "PGRST100", message: "bad select" });
  const sel = selectCols.includes("*") ? "*" : selectCols.map(q).join(", ");
  const params = [];
  const where = [];
  for (const [k, v] of p) {
    if (RESERVED.has(k)) continue;
    if (!valid(k) || !v.startsWith("eq.")) return send(res, 400, { code: "PGRST100", message: `unsupported filter ${k}` });
    params.push(v.slice(3));
    where.push(`${q(k)} = $${params.length}`);
  }
  const whereSql = where.length ? ` where ${where.join(" and ")}` : "";
  const val = (c, v) => (def.json.includes(c) && v !== null && v !== undefined ? JSON.stringify(v) : v);

  let sql;
  if (req.method === "GET") {
    const order = p.get("order");
    let orderSql = "";
    if (order) {
      const [c, dir] = order.split(".");
      if (!valid(c)) return send(res, 400, { code: "PGRST100", message: "bad order" });
      orderSql = ` order by ${q(c)} ${dir === "desc" ? "desc" : "asc"}`;
    }
    const lim = p.get("limit") ? ` limit ${Math.min(1000, Number(p.get("limit")) || 0)}` : "";
    sql = `select ${sel} from public.${table}${whereSql}${orderSql}${lim}`;
  } else if (req.method === "POST") {
    const body = await readBody(req);
    const rows = Array.isArray(body) ? body : [body];
    const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
    if (!cols.length || cols.some((c) => !valid(c))) return send(res, 400, { code: "PGRST204", message: "bad columns" });
    const values = rows.map((r) => `(${cols.map((c) => (params.push(val(c, r[c] ?? null)), `$${params.length}`)).join(", ")})`);
    sql = `insert into public.${table} (${cols.map(q).join(", ")}) values ${values.join(", ")}`;
    const onConflict = p.get("on_conflict");
    if (onConflict) {
      const tgt = onConflict.split(",");
      if (tgt.some((c) => !valid(c))) return send(res, 400, { code: "PGRST100", message: "bad on_conflict" });
      if (prefer.includes("resolution=ignore-duplicates")) sql += ` on conflict (${tgt.map(q).join(", ")}) do nothing`;
      else if (prefer.includes("resolution=merge-duplicates")) sql += ` on conflict (${tgt.map(q).join(", ")}) do update set ${cols.map((c) => `${q(c)} = excluded.${q(c)}`).join(", ")}`;
    }
    sql += ` returning ${sel}`;
  } else if (req.method === "PATCH") {
    const body = await readBody(req);
    const cols = Object.keys(body);
    if (!cols.length || cols.some((c) => !valid(c))) return send(res, 400, { code: "PGRST204", message: "bad columns" });
    const sets = cols.map((c) => (params.push(val(c, body[c])), `${q(c)} = $${params.length}`));
    sql = `update public.${table} set ${sets.join(", ")}${whereSql} returning ${sel}`;
  } else if (req.method === "DELETE") {
    sql = `delete from public.${table}${whereSql} returning ${sel}`;
  } else return send(res, 405, { message: "method not allowed" });

  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(`set local role ${role}`);
    await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
    const r = await client.query(sql, params);
    await client.query("commit");
    const headers = prefer.includes("count=exact") ? { "Content-Range": `*/${r.rowCount}` } : {};
    if (req.method !== "GET" && !prefer.includes("return=representation")) return send(res, req.method === "POST" ? 201 : 204, undefined, headers);
    return send(res, req.method === "POST" ? 201 : 200, r.rows, headers);
  } catch (e) {
    await client.query("rollback").catch(() => {});
    restError(res, e, role);
  } finally {
    client.release();
  }
}

/* ----------------------------- test hooks ----------------------------- */

async function testHooks(req, res, url) {
  if (url.pathname === "/__test/outbox") {
    const email = (url.searchParams.get("email") ?? "").toLowerCase();
    return send(res, 200, outbox.filter((m) => !email || m.to.toLowerCase() === email));
  }
  if (url.pathname === "/__test/revoke" && req.method === "POST") {
    // Simulates an expired or remotely revoked session for the given user.
    const b = await readBody(req);
    const user = await userByEmail(b.email ?? "");
    let n = 0;
    for (const s of sessions.values()) {
      if (user && s.userId === user.id && !s.revoked) {
        s.revoked = true;
        n++;
      }
    }
    return send(res, 200, { revoked: n });
  }
  if (url.pathname === "/__test/token" && req.method === "POST") {
    // Lets the RLS e2e test call REST directly as a given user (password login, same as the app).
    const b = await readBody(req);
    const user = await userByEmail(b.email ?? "");
    if (!user || !checkPassword(String(b.password ?? ""), user.encrypted_password)) return send(res, 400, { message: "bad credentials" });
    return send(res, 200, await createSession(user));
  }
  return send(res, 404, {});
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  try {
    if (url.pathname.startsWith("/auth/v1")) return await auth(req, res, url);
    if (url.pathname.startsWith("/rest/v1/")) return await rest(req, res, url);
    if (url.pathname.startsWith("/__test/")) return await testHooks(req, res, url);
    send(res, 404, {});
  } catch (e) {
    console.error("[standin] error", e.message);
    send(res, 500, { message: "stand-in error" });
  }
});
server.listen(PORT, () => console.log(`[standin] TEST-ONLY Supabase stand-in on http://localhost:${PORT} (confirm emails: ${REQUIRE_CONFIRM ? "on" : "off"})`));
