"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/** Lightweight tooltip on hover and keyboard focus. The trigger must be focusable. */
export function Tooltip({ content, children, side = "top", className }: { content: React.ReactNode; children: React.ReactElement; side?: "top" | "bottom"; className?: string }) {
  const id = React.useId();
  const [open, setOpen] = React.useState(false);
  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
    >
      {React.cloneElement(children as React.ReactElement<{ "aria-describedby"?: string }>, { "aria-describedby": id })}
      <span
        role="tooltip"
        id={id}
        className={cn(
          "pointer-events-none absolute left-1/2 z-50 w-max max-w-64 -translate-x-1/2 rounded-lg bg-ink px-2.5 py-1.5 text-xs leading-snug font-medium text-white shadow-lg transition-[opacity,transform] duration-150",
          side === "top" ? "bottom-full mb-2" : "top-full mt-2",
          open ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0",
          className,
        )}
      >
        {content}
      </span>
    </span>
  );
}
