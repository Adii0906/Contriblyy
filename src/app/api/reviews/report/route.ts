import { requireUser } from "@/lib/auth/session";
import { fail, json, limit, readJson, sameOrigin } from "@/lib/server/http";
import { log } from "@/lib/server/log";
import { reportReviewSchema } from "@/lib/reviews/schemas";
import { takeToken } from "@/lib/server/rate-limit";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return fail(403, "Cross-site request blocked.");
  const ipLimited = limit(req, "community-review-report", 10);
  if (ipLimited) return ipLimited;
  const auth = await requireUser();
  if (!auth.ok) return auth.res;
  const rate = takeToken(`community-review-report:user:${auth.userId}`, 3, 3);
  if (!rate.ok) return fail(429, `Too many reports. Try again in ${rate.retryAfter}s.`, { retryAfter: rate.retryAfter });
  const body = await readJson(req, reportReviewSchema, 512);
  if (!body.ok) return body.res;

  const { error } = await auth.supabase.from("community_review_reports").insert({ review_id: body.data.reviewId });
  if (error) {
    if (error.code === "23505") return fail(409, "You have already reported this review.");
    if (error.code === "42501") return fail(404, "That review cannot be reported.");
    if (error.message.includes("rate limit exceeded")) return fail(429, "Too many reports. Try again in a minute.");
    log("error", "community_reviews.report_failed", { code: error.code });
    return fail(502, "Could not send your report. Please try again.");
  }
  return json({ reported: true }, 201);
}
