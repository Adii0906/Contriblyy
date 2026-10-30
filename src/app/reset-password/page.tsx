import { Suspense } from "react";
import type { Metadata } from "next";
import { AuthLayout } from "@/components/auth/auth-ui";
import { ResetForm } from "@/components/auth/forms/reset-form";

export const metadata: Metadata = { title: "Set a new password · Contribly" };

export default function ResetPage() {
  return (
    <AuthLayout>
      <Suspense>
        <ResetForm />
      </Suspense>
    </AuthLayout>
  );
}
