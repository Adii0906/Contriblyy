import { Suspense } from "react";
import type { Metadata } from "next";
import { AuthLayout } from "@/components/auth/auth-ui";
import { SignupForm } from "@/components/auth/forms/signup-form";

export const metadata: Metadata = { title: "Create account · Contribly" };

export default function SignupPage() {
  return (
    <AuthLayout>
      <Suspense>
        <SignupForm />
      </Suspense>
    </AuthLayout>
  );
}
