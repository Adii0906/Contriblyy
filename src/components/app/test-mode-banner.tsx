"use client";

import { FlaskConical } from "lucide-react";
import { useEffect } from "react";
import { useApp } from "@/lib/client/store";
import { loadServerStatus } from "@/lib/client/actions";

/** Always visible in test mode so fixture data is never mistaken for live GitHub. */
export function TestModeBanner() {
  const server = useApp((s) => s.server);
  useEffect(() => {
    if (!server) void loadServerStatus();
  }, [server]);
  if (server?.mode !== "test") return null;
  return (
    <>
      <div aria-hidden className="fixed bottom-4 right-4 z-[60] inline-flex items-center gap-1.5 rounded-full bg-ink px-3 py-1.5 text-xs font-bold text-white shadow-lg">
        <FlaskConical className="size-3.5 text-brand" /> Test mode: fixture data
      </div>
      <div role="status" className="relative z-50 flex items-center justify-center gap-2 bg-ink px-4 py-2 text-center text-[13px] text-white">
        <FlaskConical className="size-4 shrink-0 text-brand" aria-hidden />
        <span>
          <strong className="font-bold">Test mode.</strong> Results come from a local fixture server with fictional repositories, not live GitHub.
        </span>
      </div>
    </>
  );
}
