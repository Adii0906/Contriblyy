import type { SupabaseClient } from "@supabase/supabase-js";
import { requireUser } from "@/lib/auth/session";
import { createSupabaseServer } from "@/lib/supabase/server";
import { fail, json, limit, readJson, sameOrigin } from "@/lib/server/http";
import { log } from "@/lib/server/log";
import { reviewContentSchema } from "@/lib/reviews/schemas";
import { takeToken } from "@/lib/server/rate-limit";

const PAGE_SIZE = 6;
const REVIEW_COLUMNS = "id, rating, review_text, display_name, github_username, avatar_url, created_at, updated_at";

interface ReviewRow {
  id: string;
  rating: number;
  review_text: string;
  display_name: string;
  github_username: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

function consumeUserLimit(bucket: string, userId: string, capacity: number) {
  const result = takeToken(`${bucket}:user:${userId}`, capacity, capacity);
  return result.ok ? null : fail(429, `Too many attempts. Try again in ${result.retryAfter}s.`, { retryAfter: result.retryAfter });
}

async function getMyReview(supabase: SupabaseClient): Promise<{ review: ReviewRow | null; error: unknown }> {
  const { data, error } = await supabase.rpc("community_review_mine");
  if (error) return { review: null, error };
  const rows = data as ReviewRow[] | null;
  return { review: rows?.[0] ?? null, error: null };
}

function toReview(row: ReviewRow) {
  return {
    id: row.id,
    rating: row.rating,
    reviewText: row.review_text,
    displayName: row.display_name,
    githubUsername: row.github_username,
    avatarUrl: row.avatar_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Public page of reviews and aggregate stats; only the caller's own review is personalized. */
export async function GET(req: Request) {
  const supabase = await createSupabaseServer();
  if (!supabase) return fail(503, "Community reviews are not configured on this server.");

  const url = new URL(req.url);
  const parsedPage = Number(url.searchParams.get("page") ?? "0");
  if (!Number.isSafeInteger(parsedPage) || parsedPage < 0 || parsedPage > 100_000) return fail(400, "Invalid review page.");

  const { data: claims } = await supabase.auth.getClaims();
  const userId = typeof claims?.claims?.sub === "string" ? claims.claims.sub : null;
  const start = parsedPage * PAGE_SIZE;

  const [reviewsResult, statsResult, mineResult] = await Promise.all([
    supabase.from("community_reviews_public").select(REVIEW_COLUMNS).order("created_at", { ascending: false }).range(start, start + PAGE_SIZE),
    supabase.from("community_review_stats").select("review_count, average_rating").single(),
    userId ? getMyReview(supabase) : Promise.resolve({ review: null, error: null }),
  ]);

  if (reviewsResult.error || statsResult.error || mineResult.error) {
    log("error", "community_reviews.list_failed", {
      reviewsCode: reviewsResult.error?.code,
      statsCode: statsResult.error?.code,
      mineCode: (mineResult.error as { code?: string } | null)?.code,
    });
    return fail(502, "Could not load community reviews. Please try again.");
  }

  const pageRows = (reviewsResult.data ?? []) as ReviewRow[];
  const items = pageRows.slice(0, PAGE_SIZE).map(toReview);
  const reviewCount = Number(statsResult.data.review_count) || 0;
  const averageRating = reviewCount ? Number(Number(statsResult.data.average_rating).toFixed(1)) : null;

  return json({
    items,
    hasMore: pageRows.length > PAGE_SIZE,
    page: parsedPage,
    reviewCount,
    averageRating,
    isAuthenticated: Boolean(userId),
    myReview: mineResult.review ? toReview(mineResult.review) : null,
  });
}

/** Create a review. The database assigns the user and derives their public identity. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return fail(403, "Cross-site request blocked.");
  const ipLimited = limit(req, "community-review", 30);
  if (ipLimited) return ipLimited;
  const auth = await requireUser();
  if (!auth.ok) return auth.res;
  const userLimited = consumeUserLimit("community-review-write", auth.userId, 6);
  if (userLimited) return userLimited;
  const body = await readJson(req, reviewContentSchema, 2_048);
  if (!body.ok) return body.res;

  const { data, error } = await auth.supabase
    .from("community_reviews")
    .insert({ rating: body.data.rating, review_text: body.data.reviewText })
    .select(REVIEW_COLUMNS)
    .single();
  if (error) {
    if (error.code === "23505") return fail(409, "You have already written a review. Edit your existing review instead.");
    if (error.message.includes("rate limit exceeded")) return fail(429, "You are editing or submitting reviews too quickly. Try again in a minute.");
    log("error", "community_reviews.create_failed", { code: error.code });
    return fail(502, "Could not submit your review. Please try again.");
  }
  return json({ item: toReview(data as ReviewRow) }, 201);
}

/** Edit the caller's single review. The review ID is resolved from the auth-bound database function. */
export async function PATCH(req: Request) {
  if (!sameOrigin(req)) return fail(403, "Cross-site request blocked.");
  const ipLimited = limit(req, "community-review-edit", 30);
  if (ipLimited) return ipLimited;
  const auth = await requireUser();
  if (!auth.ok) return auth.res;
  const userLimited = consumeUserLimit("community-review-write", auth.userId, 6);
  if (userLimited) return userLimited;
  const body = await readJson(req, reviewContentSchema, 2_048);
  if (!body.ok) return body.res;

  const current = await getMyReview(auth.supabase);
  if (current.error) {
    log("error", "community_reviews.own_review_failed", { code: (current.error as { code?: string }).code });
    return fail(502, "Could not load your review. Please try again.");
  }
  if (!current.review) return fail(404, "You do not have a review to edit.");

  const { data, error } = await auth.supabase
    .from("community_reviews")
    .update({ rating: body.data.rating, review_text: body.data.reviewText })
    .eq("id", current.review.id)
    .select(REVIEW_COLUMNS)
    .single();
  if (error) {
    if (error.message.includes("rate limit exceeded")) return fail(429, "You are editing reviews too quickly. Try again in a minute.");
    log("error", "community_reviews.update_failed", { code: error.code });
    return fail(502, "Could not update your review. Please try again.");
  }
  return json({ item: toReview(data as ReviewRow) });
}

/** Delete the caller's review; RLS and the caller-bound lookup both enforce ownership. */
export async function DELETE(req: Request) {
  if (!sameOrigin(req)) return fail(403, "Cross-site request blocked.");
  const ipLimited = limit(req, "community-review-delete", 20);
  if (ipLimited) return ipLimited;
  const auth = await requireUser();
  if (!auth.ok) return auth.res;
  const userLimited = consumeUserLimit("community-review-write", auth.userId, 6);
  if (userLimited) return userLimited;

  const current = await getMyReview(auth.supabase);
  if (current.error) {
    log("error", "community_reviews.own_review_failed", { code: (current.error as { code?: string }).code });
    return fail(502, "Could not load your review. Please try again.");
  }
  if (!current.review) return fail(404, "You do not have a review to delete.");

  const { error, count } = await auth.supabase
    .from("community_reviews")
    .delete({ count: "exact" })
    .eq("id", current.review.id);
  if (error) {
    if (error.message.includes("rate limit exceeded")) return fail(429, "You are deleting reviews too quickly. Try again in a minute.");
    log("error", "community_reviews.delete_failed", { code: error.code });
    return fail(502, "Could not delete your review. Please try again.");
  }
  if (!count) return fail(404, "Your review has already been deleted.");
  return json({ deleted: true });
}
