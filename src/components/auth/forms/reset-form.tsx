"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { passwordSchema, passwordStrength } from "@/lib/auth/schemas";
import { useApp } from "@/lib/client/store";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { AuthHeading, FormAlert, PasswordField, postJson } from "../auth-ui";

/** Reached from the reset email: /auth/confirm created a short-lived recovery session. */
export function ResetForm() {
  const router = useRouter();
  const auth = useApp((s) => s.auth);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (auth.status === "loading") return <div className="skeleton h-72 rounded-2xl" aria-busy="true" aria-label="Checking your link" />;

  if (auth.status !== "signed-in") {
    return (
      <>
        <AuthHeading eyebrow="Reset link" title="This link has expired">
          Password reset links work once and only for a short time. Request a new one to continue.
        </AuthHeading>
        <Link href="/forgot-password" className={buttonVariants({ variant: "primary", size: "lg", className: "w-full" })}>
          Send a new link
        </Link>
      </>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const errs: typeof errors = {};
    const pw = passwordSchema.safeParse(password);
    if (!pw.success) errs.password = pw.error.issues[0]?.message;
    else if (passwordStrength(password, auth.user?.email ?? undefined).score <= 1) errs.password = "That password is easy to guess. Make it longer or less predictable.";
    if (confirm !== password) errs.confirm = "Passwords don't match.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    setFormError(null);
    const r = await postJson("/api/auth/reset", { password });
    setBusy(false);
    if (!r.ok) return setFormError(r.data.error ?? "Could not update your password.");
    useApp.getState().toast("ok", "Password updated.");
    router.replace("/app");
  };

  return (
    <>
      <AuthHeading eyebrow={auth.user?.email ?? undefined} title="Choose a new password" />
      <form onSubmit={submit} noValidate className="space-y-5" aria-busy={busy}>
        {formError && <FormAlert tone="bad">{formError}</FormAlert>}
        <PasswordField label="New password" name="new-password" autoComplete="new-password" value={password} onChange={(e) => { setPassword(e.target.value); setErrors((x) => ({ ...x, password: undefined })); }} error={errors.password} showStrength email={auth.user?.email ?? undefined} maxLength={72} />
        <PasswordField label="Confirm new password" name="confirm-password" autoComplete="new-password" value={confirm} onChange={(e) => { setConfirm(e.target.value); setErrors((x) => ({ ...x, confirm: undefined })); }} error={errors.confirm} maxLength={72} />
        <Button type="submit" variant="primary" size="lg" className="w-full" disabled={busy}>
          {busy ? <Loader2 className="animate-spin" aria-hidden /> : null}
          {busy ? "Saving" : "Save new password"}
        </Button>
      </form>
    </>
  );
}
