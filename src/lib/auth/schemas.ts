// Shared auth validation (client for UX, server for enforcement). Pure.
import { z } from "zod";

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72; // bcrypt input limit used by Supabase Auth

export function passwordRequirements(password: string) {
  return [
    { id: "length", label: `At least ${PASSWORD_MIN} characters`, met: password.length >= PASSWORD_MIN },
    { id: "uppercase", label: "At least one uppercase letter (A-Z)", met: /[A-Z]/.test(password) },
    { id: "lowercase", label: "At least one lowercase letter (a-z)", met: /[a-z]/.test(password) },
    { id: "number", label: "At least one number (0-9)", met: /[0-9]/.test(password) },
    { id: "special", label: "At least one special character (for example @, #, ! or $)", met: /[^A-Za-z0-9]/.test(password) },
  ] as const;
}

export const emailSchema = z
  .string()
  .trim()
  .min(1, "Enter your email address.")
  .max(254, "That email address is too long.")
  .email("Enter a valid email address.");

export const passwordSchema = z.string().superRefine((password, ctx) => {
  if (password.length > PASSWORD_MAX) {
    ctx.addIssue({ code: "custom", message: `Use at most ${PASSWORD_MAX} characters.` });
  }
  for (const requirement of passwordRequirements(password)) {
    if (!requirement.met) {
      ctx.addIssue({
        code: "custom",
        message: requirement.id === "length" ? `Use at least ${PASSWORD_MIN} characters.` : requirement.label,
      });
    }
  }
});

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
  score: 1 | 2 | 3;
  label: "Weak" | "Fair" | "Strong";
  tips: string[];
}

/** Password policy and its UI strength label share the same requirement checks. */
export function passwordStrength(password: string): StrengthResult {
  const missing = passwordRequirements(password).filter((requirement) => !requirement.met);
  if (missing.length) {
    return { score: 1, label: "Weak", tips: [missing.map((requirement) => requirement.label).join(", ")] };
  }
  if (password.length < 12) {
    return { score: 2, label: "Fair", tips: ["12 or more characters is recommended for a stronger password."] };
  }
  return { score: 3, label: "Strong", tips: ["All password requirements are met."] };
}

export function firstError(err: z.ZodError): string {
  return err.issues[0]?.message ?? "Check the form and try again.";
}
