import { z } from "zod";

const reviewTextSchema = z
  .string()
  .max(512, "Reviews must be 500 characters or fewer.")
  .transform((value) => value.normalize("NFKC").replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim())
  .pipe(z.string().min(20, "Reviews must be at least 20 characters.").max(500, "Reviews must be 500 characters or fewer."));

export const reviewContentSchema = z.object({
  rating: z.number().int().min(1, "Choose a rating from 1 to 5.").max(5, "Choose a rating from 1 to 5."),
  reviewText: reviewTextSchema,
});

export const reportReviewSchema = z.object({
  reviewId: z.uuid(),
});
