import { describe, expect, it } from "vitest";
import { reportReviewSchema, reviewContentSchema } from "../src/lib/reviews/schemas";

describe("community review request validation", () => {
  it("accepts valid ratings and trims normalized review text", () => {
    const parsed = reviewContentSchema.parse({ rating: 5, reviewText: "  " + "A useful, genuine review. ".repeat(2) + "  " });
    expect(parsed.rating).toBe(5);
    expect(parsed.reviewText).toBe("A useful, genuine review. A useful, genuine review.");
  });

  it("rejects fractional and out-of-range ratings", () => {
    for (const rating of [0, 6, 2.5, "5"]) {
      expect(reviewContentSchema.safeParse({ rating, reviewText: "A review with enough characters." }).success).toBe(false);
    }
  });

  it("enforces the review length after trimming and sanitizing control characters", () => {
    expect(reviewContentSchema.safeParse({ rating: 3, reviewText: "too short" }).success).toBe(false);
    expect(reviewContentSchema.safeParse({ rating: 3, reviewText: "x".repeat(501) }).success).toBe(false);
    expect(reviewContentSchema.safeParse({ rating: 3, reviewText: "x".repeat(20) }).success).toBe(true);
    expect(reviewContentSchema.safeParse({ rating: 3, reviewText: "x".repeat(512) }).success).toBe(false);
  });

  it("accepts only a valid review UUID for reports", () => {
    expect(reportReviewSchema.safeParse({ reviewId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11" }).success).toBe(true);
    expect(reportReviewSchema.safeParse({ reviewId: "not-an-id" }).success).toBe(false);
  });
});
