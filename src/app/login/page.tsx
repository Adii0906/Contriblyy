import { Suspense } from "react";
import type { Metadata } from "next";
import { AuthLayout } from "@/components/auth/auth-ui";
import { LoginForm } from "@/components/auth/forms/login-form";

export const metadata: Metadata = { title: "Log in · Contribly" };

export default function LoginPage() {
  return (
    <AuthLayout>
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthLayout>
  );
}
