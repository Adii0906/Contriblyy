import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { findPgBin, startTestDb } from "../scripts/test-db.mjs";

const hasPg = Boolean(findPgBin());
const ALICE = "11111111-1111-4111-8111-111111111111";
const BOB = "22222222-2222-4222-8222-222222222222";

let db: { url: string; stop: () => void };
let admin: pg.Client;

async function as<T>(user: string | null, fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const c = new pg.Client({ connectionString: db.url });
  await c.connect();
  try {
    await c.query("begin");
    await c.query(`set local role ${user ? "authenticated" : "anon"}`);
    await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(user ? { sub: user, role: "authenticated" } : { role: "anon" })]);
    const out = await fn(c);
    await c.query("commit");
    return out;
  } catch (error) {
    await c.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    await c.end();
  }
}

async function createReview(user: string, rating = 5, text = "This review is long enough to be valid.") {
  return as(user, async (client) => {
    const result = await client.query(
      "insert into public.community_reviews (rating, review_text) values ($1, $2) returning id, display_name, github_username, avatar_url",
      [rating, text],
    );
    return result.rows[0] as { id: string; display_name: string; github_username: string | null; avatar_url: string | null };
  });
}

describe.skipIf(!hasPg)("community review database security (real PostgreSQL)", () => {
  beforeAll(async () => {
    db = await startTestDb({ port: 54372 });
    admin = new pg.Client({ connectionString: db.url });
    await admin.connect();
    await admin.query(
      "insert into auth.users (id, email, raw_user_meta_data) values ($1, 'alice@example.test', $2), ($3, 'bob@example.test', $4)",
      [ALICE, JSON.stringify({ full_name: "Alice Developer" }), BOB, JSON.stringify({ full_name: "Bob Developer" })],
    );
    await admin.query(
      "insert into auth.identities (user_id, provider_id, provider, identity_data) values ($1, '1', 'github', $2)",
      [ALICE, JSON.stringify({ user_name: "alice-dev", name: "Alice from GitHub", avatar_url: "https://avatars.githubusercontent.com/u/1?v=4" })],
    );
  }, 60_000);

  afterAll(async () => {
    await admin?.end();
    db?.stop();
  });

  afterEach(async () => {
    await admin.query("truncate public.community_review_reports, public.community_reviews, public.community_review_rate_limits");
  });

  it("publishes only safe review fields and derives identity from the linked GitHub account", async () => {
    const review = await createReview(ALICE);
    expect(review).toEqual({
      id: expect.any(String),
      display_name: "Alice from GitHub",
      github_username: "alice-dev",
      avatar_url: "https://avatars.githubusercontent.com/u/1?v=4",
    });
    const publicRows = await as(null, async (client) => (await client.query("select * from public.community_reviews_public")).rows);
    expect(publicRows).toHaveLength(1);
    expect(publicRows[0]).not.toHaveProperty("user_id");
    expect(publicRows[0].review_text).toBe("This review is long enough to be valid.");
    const stats = await as(null, async (client) => (await client.query("select review_count, average_rating from public.community_review_stats")).rows[0]);
    expect(stats).toEqual({ review_count: "1", average_rating: "5.00" });
    const viewOptions = await admin.query(
      "select relname, reloptions from pg_class where oid in ('public.community_reviews_public'::regclass, 'public.community_review_stats'::regclass)",
    );
    expect(viewOptions.rows).toHaveLength(2);
    for (const view of viewOptions.rows as { reloptions: string[] | null }[]) {
      expect(view.reloptions).toContain("security_invoker=true");
    }
    await expect(as(null, (client) => client.query("select * from public.community_reviews"))).rejects.toThrow(/permission denied/);
  });

  it("lets a signed-in user load only their own review through the private RPC", async () => {
    await createReview(ALICE);
    const aliceReview = await as(ALICE, async (client) => (await client.query("select * from public.community_review_mine()")).rows);
    const bobReview = await as(BOB, async (client) => (await client.query("select * from public.community_review_mine()")).rows);
    expect(aliceReview).toHaveLength(1);
    expect(aliceReview[0].review_text).toBe("This review is long enough to be valid.");
    expect(bobReview).toHaveLength(0);
    await expect(as(null, (client) => client.query("select * from public.community_review_mine()"))).rejects.toThrow(/permission denied/);
  });

  it("restricts the private RPC to authenticated and keeps its definer configuration safe", async () => {
    const result = await admin.query(`
      select
        p.prosecdef,
        p.proconfig,
        pg_get_userbyid(p.proowner) as owner,
        has_function_privilege('authenticated', p.oid, 'execute') as authenticated_can_execute,
        has_function_privilege('anon', p.oid, 'execute') as anon_can_execute,
        (select count(*) from pg_proc x join pg_namespace n on n.oid = x.pronamespace
          where n.nspname = 'public' and x.proname = 'community_review_mine') as overload_count
      from pg_proc p
      where p.oid = 'public.community_review_mine()'::regprocedure
    `);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      prosecdef: true,
      authenticated_can_execute: true,
      anon_can_execute: false,
      overload_count: "1",
    });
    expect(result.rows[0].proconfig).toContain("search_path=\"\"");
    expect(result.rows[0].owner).toBe("postgres");
  });

  it("enforces one review per user and does not permit identity spoofing", async () => {
    await expect(createReview(ALICE)).rejects.toThrow(/community_reviews_one_per_user/);
    await expect(
      as(BOB, (client) => client.query(
        "insert into public.community_reviews (rating, review_text, display_name) values (4, 'This review is long enough to be valid.', 'Alice')",
      )),
    ).rejects.toThrow(/permission denied/);
  });

  it("enforces rating and review length at the database boundary", async () => {
    await expect(createReview(BOB, 6)).rejects.toThrow(/check constraint/);
    await expect(createReview(BOB, 4, "short")).rejects.toThrow(/check constraint/);
  });

  it("keeps edits and deletes within the authenticated owner", async () => {
    const review = await createReview(BOB);
    const updated = await as(BOB, async (client) => (await client.query(
      "update public.community_reviews set review_text = 'An updated review with enough characters.' where id = $1 returning review_text",
      [review.id],
    )).rows);
    expect(updated).toEqual([{ review_text: "An updated review with enough characters." }]);

    const aliceCannotEdit = await as(ALICE, async (client) => (await client.query(
      "update public.community_reviews set review_text = 'Attempted cross-account modification.' where id = $1",
      [review.id],
    )).rowCount);
    const aliceCannotDelete = await as(ALICE, async (client) => (await client.query(
      "delete from public.community_reviews where id = $1",
      [review.id],
    )).rowCount);
    expect(aliceCannotEdit).toBe(0);
    expect(aliceCannotDelete).toBe(0);
  });

  it("accepts reports only from authenticated non-owners and prevents duplicate reports", async () => {
    const review = await createReview(ALICE);
    await expect(as(ALICE, (client) => client.query(
      "insert into public.community_review_reports (review_id) values ($1)",
      [review.id],
    ))).rejects.toThrow(/review cannot be reported/);

    await as(BOB, (client) => client.query(
      "insert into public.community_review_reports (review_id) values ($1)",
      [review.id],
    ));
    await expect(as(BOB, (client) => client.query(
      "insert into public.community_review_reports (review_id) values ($1)",
      [review.id],
    ))).rejects.toThrow(/community_review_reports_one_per_user/);
    await expect(as(null, (client) => client.query(
      "insert into public.community_review_reports (review_id) values ($1)",
      [review.id],
    ))).rejects.toThrow(/permission denied/);
  });
});

describe.runIf(!hasPg)("community review database security", () => {
  it.skip("skipped: PostgreSQL server binaries not found (set PG_BIN)", () => {});
});
