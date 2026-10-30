// Row Level Security tests against a real PostgreSQL server using the real
// migration file. Skipped automatically when PostgreSQL binaries are missing.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { findPgBin, startTestDb } from "../scripts/test-db.mjs";

const hasPg = Boolean(findPgBin());
const ALICE = "11111111-1111-4111-8111-111111111111";
const BOB = "22222222-2222-4222-8222-222222222222";

let db: { url: string; stop: () => void };
let admin: pg.Client;

async function as<T>(user: string | null, fn: (c: pg.PoolClient | pg.Client) => Promise<T>): Promise<T> {
  const c = new pg.Client({ connectionString: db.url });
  await c.connect();
  try {
    await c.query("begin");
    await c.query(`set local role ${user ? "authenticated" : "anon"}`);
    await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(user ? { sub: user, role: "authenticated" } : { role: "anon" })]);
    const out = await fn(c);
    await c.query("commit");
    return out;
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    await c.end();
  }
}

const issue = (id: number, extra: Record<string, unknown> = {}) => ({
  github_issue_id: id,
  repo_owner: "octo",
  repo_name: "repo",
  issue_number: id,
  title: `Issue ${id}`,
  url: `https://github.com/octo/repo/issues/${id}`,
  snapshot: JSON.stringify({ id, title: `Issue ${id}` }),
  ...extra,
});

async function insert(c: pg.Client | pg.PoolClient, row: Record<string, unknown>) {
  const cols = Object.keys(row);
  const vals = Object.values(row);
  return c.query(`insert into public.saved_issues (${cols.join(",")}) values (${cols.map((_, i) => `$${i + 1}`).join(",")}) returning *`, vals);
}

describe.skipIf(!hasPg)("RLS on saved_issues and user_preferences (real PostgreSQL)", () => {
  beforeAll(async () => {
    db = await startTestDb({ port: 54371 });
    admin = new pg.Client({ connectionString: db.url });
    await admin.connect();
    await admin.query("insert into auth.users (id, email) values ($1, 'alice@example.test'), ($2, 'bob@example.test')", [ALICE, BOB]);
  }, 60_000);

  afterAll(async () => {
    await admin?.end();
    db?.stop();
  });

  it("alice can save, list and see only her own rows; user_id comes from auth.uid()", async () => {
    const row = await as(ALICE, async (c) => (await insert(c, issue(101))).rows[0]);
    expect(row.user_id).toBe(ALICE);
    await as(BOB, (c) => insert(c, issue(202)));
    const aliceRows = await as(ALICE, async (c) => (await c.query("select github_issue_id, user_id from public.saved_issues")).rows);
    expect(aliceRows).toEqual([{ github_issue_id: "101", user_id: ALICE }]);
  });

  it("duplicate save for the same user is rejected by the unique constraint", async () => {
    await expect(as(ALICE, (c) => insert(c, issue(101)))).rejects.toThrow(/saved_issues_user_issue_unique/);
    // ON CONFLICT DO NOTHING is the app's save path: idempotent
    const r = await as(ALICE, (c) =>
      c.query(
        "insert into public.saved_issues (github_issue_id, repo_owner, repo_name, issue_number, title, url, snapshot) values (101,'octo','repo',101,'x','https://github.com/octo/repo/issues/101','{}') on conflict (user_id, github_issue_id) do nothing returning id",
      ),
    );
    expect(r.rowCount).toBe(0);
  });

  it("the same issue can be saved by two different users", async () => {
    await as(BOB, (c) => insert(c, issue(101)));
    const all = await admin.query("select user_id from public.saved_issues where github_issue_id = 101 order by user_id");
    expect(all.rows.map((r) => r.user_id)).toEqual([ALICE, BOB]);
  });

  it("bob cannot read, update or delete alice's rows", async () => {
    const read = await as(BOB, async (c) => (await c.query("select * from public.saved_issues where user_id = $1", [ALICE])).rowCount);
    expect(read).toBe(0);
    const upd = await as(BOB, async (c) => (await c.query("update public.saved_issues set title = 'pwned' where user_id = $1", [ALICE])).rowCount);
    expect(upd).toBe(0);
    const del = await as(BOB, async (c) => (await c.query("delete from public.saved_issues where user_id = $1", [ALICE])).rowCount);
    expect(del).toBe(0);
    const still = await admin.query("select title from public.saved_issues where user_id = $1", [ALICE]);
    expect(still.rows.map((r) => r.title)).toEqual(["Issue 101"]);
  });

  it("bob cannot insert a row owned by alice", async () => {
    await expect(as(BOB, (c) => insert(c, { ...issue(303), user_id: ALICE }))).rejects.toThrow(/row-level security/);
  });

  it("ownership and identity columns cannot be changed, even on your own row", async () => {
    await expect(as(ALICE, (c) => c.query("update public.saved_issues set user_id = $1 where github_issue_id = 101", [BOB]))).rejects.toThrow(/permission denied/);
    await expect(as(ALICE, (c) => c.query("update public.saved_issues set github_issue_id = 999 where github_issue_id = 101"))).rejects.toThrow(/permission denied/);
    const ok = await as(ALICE, async (c) => (await c.query("update public.saved_issues set verification = '{\"checkedAt\":\"x\"}' where github_issue_id = 101")).rowCount);
    expect(ok).toBe(1);
  });

  it("alice can delete her own row", async () => {
    await as(ALICE, (c) => insert(c, issue(404)));
    const n = await as(ALICE, async (c) => (await c.query("delete from public.saved_issues where github_issue_id = 404")).rowCount);
    expect(n).toBe(1);
  });

  it("anonymous callers have no access", async () => {
    await expect(as(null, (c) => c.query("select * from public.saved_issues"))).rejects.toThrow(/permission denied/);
    await expect(as(null, (c) => insert(c, issue(505)))).rejects.toThrow(/permission denied/);
    await expect(as(null, (c) => c.query("select * from public.user_preferences"))).rejects.toThrow(/permission denied/);
  });

  it("check constraints reject non-GitHub URLs and oversized payloads", async () => {
    await expect(as(ALICE, (c) => insert(c, issue(606, { url: "https://evil.example/x" })))).rejects.toThrow(/check constraint/);
    const big = JSON.stringify({ blob: "x".repeat(40_000) });
    await expect(as(ALICE, (c) => insert(c, issue(607, { snapshot: big })))).rejects.toThrow(/check constraint/);
  });

  it("preferences: one row per user, isolated, upsert works for the owner only", async () => {
    const upsert = "insert into public.user_preferences (skills, weekly_hours, task_scope) values ($1, $2, $3) on conflict (user_id) do update set skills = excluded.skills, weekly_hours = excluded.weekly_hours, task_scope = excluded.task_scope returning user_id, weekly_hours";
    const a = await as(ALICE, async (c) => (await c.query(upsert, ['[{"id":"python"}]', "5-8", "any"])).rows[0]);
    expect(a).toEqual({ user_id: ALICE, weekly_hours: "5-8" });
    const a2 = await as(ALICE, async (c) => (await c.query(upsert, ['[{"id":"go"}]', "15+", "quick"])).rows[0]);
    expect(a2.weekly_hours).toBe("15+");
    const bobSees = await as(BOB, async (c) => (await c.query("select * from public.user_preferences")).rowCount);
    expect(bobSees).toBe(0);
    await expect(as(BOB, (c) => c.query("insert into public.user_preferences (user_id) values ($1)", [ALICE]))).rejects.toThrow(/row-level security/);
    await expect(as(ALICE, (c) => c.query("update public.user_preferences set weekly_hours = 'lots'"))).rejects.toThrow(/check constraint/);
  });

  it("deleting a user cascades to their data", async () => {
    await admin.query("delete from auth.users where id = $1", [BOB]);
    const left = await admin.query("select count(*)::int as n from public.saved_issues where user_id = $1", [BOB]);
    expect(left.rows[0].n).toBe(0);
  });
});

describe.runIf(!hasPg)("RLS tests", () => {
  it.skip("skipped: PostgreSQL server binaries not found (set PG_BIN)", () => {});
});
