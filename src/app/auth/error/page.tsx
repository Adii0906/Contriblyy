import { Suspense } from "react";
import type { Metadata } from "next";
import { AuthLayout } from "@/components/auth/auth-ui";
import { AuthErrorView } from "@/components/auth/forms/auth-error";

export const metadata: Metadata = { title: "Link problem · Contribly" };

export default function AuthErrorPage() {
  return (
    <AuthLayout>
      <Suspense>
        <AuthErrorView />
      </Suspense>
    </AuthLayout>
  );
}
