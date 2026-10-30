// Validation for persisted user preferences. Pure.
import { z } from "zod";
import { skillSelectionSchema } from "@/lib/schemas";

const str = z.string().max(100);
const filtersSchema = z.object({
  languages: z.array(str).max(30),
  skills: z.array(str).max(30),
  labels: z.array(str).max(30),
  levels: z.array(z.enum(["beginner", "intermediate", "advanced", "unknown"])).max(4),
  scopes: z.array(z.enum(["quick", "few-hours", "multi-day", "unclear"])).max(4),
  activity: z.array(z.enum(["recently-active", "some", "limited", "insufficient", "archived", "pending"])).max(6),
  status: z.array(z.enum(["promising", "needs-review", "likely-unavailable", "pending"])).max(4),
  sort: z.enum(["best", "recent"]),
});

export const preferencesSchema = z.object({
  skills: z.array(skillSelectionSchema).min(1).max(12),
  time: z.enum(["2-4", "5-8", "9-15", "15+"]),
  scope: z.enum(["quick", "few-hours", "multi-day", "any"]),
  autoVerify: z.boolean(),
  filters: z.object({
    current: filtersSchema.optional(),
    saved: z.array(z.object({ id: z.string().max(60), name: z.string().trim().min(1).max(40), filters: filtersSchema })).max(12).optional(),
  }),
});

export type PreferencesPayload = z.infer<typeof preferencesSchema>;
