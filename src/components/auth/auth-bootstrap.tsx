"use client";

import { useEffect } from "react";
import { useApp } from "@/lib/client/store";
import { loadSession, startPreferenceSync } from "@/lib/client/account";
import { AuthPromptDialog, PendingSaveDialog } from "./auth-dialogs";
import { Toaster } from "@/components/ui/toaster";

/** Loads the session once, keeps preferences in sync, and re-checks the session when the tab regains focus. */
export function AuthBootstrap() {
  const hydrated = useApp((s) => s.hydrated);

  useEffect(() => {
    if (!hydrated) return;
    void loadSession().then(() => {
      const url = new URL(window.location.href);
      if (url.searchParams.get("welcome") === "1") {
        if (useApp.getState().auth.status === "signed-in") useApp.getState().toast("ok", "Email verified. You're signed in.");
        url.searchParams.delete("welcome");
        window.history.replaceState(null, "", url.pathname + url.search + url.hash);
      }
    });
    const stop = startPreferenceSync();
    let last = Date.now();
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - last > 30_000) {
        last = Date.now();
        void loadSession({ quiet: true });
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [hydrated]);

  return (
    <>
      <AuthPromptDialog />
      <PendingSaveDialog />
      <Toaster />
    </>
  );
}
