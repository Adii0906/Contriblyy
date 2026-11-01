// Shared auth validation (client for UX, server for enforcement). Pure.
import { z } from "zod";

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72; // bcrypt input limit used by Supabase Auth

export const emailSchema = z
  .string()
  .trim()
  .min(1, "Enter your email address.")
  .max(254, "That email address is too long.")
  .email("Enter a valid email address.");

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters.`)
  .max(PASSWORD_MAX, `Use at most ${PASSWORD_MAX} characters.`);

export const nameSchema = z
  .string()
  .trim()
  .min(1, "Enter your name.")
  .max(60, "Keep your name under 60 characters.")
  .regex(/^[^<>\u0000-\u001f]*$/, "Your name contains characters we can't use.");

export const nextSchema = z.string().max(512).optional();

export const signupSchema = z.object({ name: nameSchema, email: emailSchema, password: passwordSchema, next: nextSchema });
export const loginSchema = z.object({ email: emailSchema, password: z.string().min(1, "Enter your password.").max(PASSWORD_MAX), next: nextSchema });
export const emailOnlySchema = z.object({ email: emailSchema });
export const resetSchema = z.object({ password: passwordSchema });

export interface StrengthResult {
  score: 0 | 1 | 2 | 3 | 4;
  label: "Too short" | "Weak" | "Fair" | "Good" | "Strong";
  tips: string[];
}

const COMMON = ["password", "123456", "qwerty", "letmein", "welcome", "contribly", "iloveyou", "admin", "github"];

/** Guidance only. Supabase enforces the real policy configured on the project. */
export function passwordStrength(pw: string, email?: string): StrengthResult {
  if (pw.length < PASSWORD_MIN) return { score: 0, label: "Too short", tips: [`Use at least ${PASSWORD_MIN} characters.`] };
  const tips: string[] = [];
  let score = 0;
  if (pw.length >= 12) score++;
  else tips.push("12 or more characters is much stronger.");
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  if (classes >= 3) score++;
  else tips.push("Mix upper and lower case, numbers and symbols.");
  if (pw.length >= 16 || classes === 4) score++;
  const lower = pw.toLowerCase();
  const local = email?.split("@")[0]?.toLowerCase();
  const weak = COMMON.some((c) => lower.includes(c)) || (local && local.length >= 3 && lower.includes(local)) || /^(.)\1+$/.test(pw) || /(?:0123|1234|2345|3456|abcd)/.test(lower);
  if (weak) {
    score = Math.max(0, score - 2);
    tips.unshift("Avoid common words, sequences and your email name.");
  } else score++;
  const s = Math.min(4, Math.max(1, score)) as 1 | 2 | 3 | 4;
  const label = (["Weak", "Fair", "Good", "Strong"] as const)[s - 1];
  return { score: s, label, tips };
}

export function firstError(err: z.ZodError): string {
  return err.issues[0]?.message ?? "Check the form and try again.";
}
