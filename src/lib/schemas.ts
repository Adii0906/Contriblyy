import { z } from "zod";

export const proficiencySchema = z.enum(["learning", "comfortable", "experienced"]);

export const skillSelectionSchema = z.object({
  id: z.string().min(1).max(60),
  label: z.string().trim().min(1).max(40),
  proficiency: proficiencySchema,
  custom: z.boolean().optional(),
});

export const discoverRequestSchema = z.object({
  skills: z.array(skillSelectionSchema).min(1).max(12),
  scope: z.enum(["quick", "few-hours", "multi-day", "any"]).default("any"),
  keywords: z.string().max(120).optional(),
  page: z.number().int().min(1).max(10).default(1),
});

const ghName = z.string().regex(/^[A-Za-z0-9_.-]{1,100}$/);

export const verifyRequestSchema = z.object({
  owner: ghName,
  repo: ghName,
  number: z.number().int().positive().max(10_000_000),
  force: z.boolean().optional(),
});
