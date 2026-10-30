"use client";

import { MotionConfig } from "motion/react";
import { useEffect } from "react";
import { useApp } from "@/lib/client/store";
import { AuthBootstrap } from "@/components/auth/auth-bootstrap";

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    void useApp.persist.rehydrate();
  }, []);
  // "user" respects prefers-reduced-motion: transforms are dropped, opacity kept.
  return (
    <MotionConfig reducedMotion="user">
      {children}
      <AuthBootstrap />
    </MotionConfig>
  );
}
