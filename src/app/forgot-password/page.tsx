import { Suspense } from "react";
import type { Metadata } from "next";
import { AuthLayout } from "@/components/auth/auth-ui";
import { ForgotForm } from "@/components/auth/forms/forgot-form";

export const metadata: Metadata = { title: "Reset your password · Contribly" };

export default function ForgotPage() {
  return (
    <AuthLayout>
      <Suspense>
        <ForgotForm />
      </Suspense>
    </AuthLayout>
  );
}
