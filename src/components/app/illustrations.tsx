/* Lightweight empty-state drawings: charcoal line work with an orange accent. */

const common = { fill: "none", stroke: "var(--ink)", strokeWidth: 2.2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

export function EmptySearchArt({ className = "h-24 w-32" }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 120" className={className} aria-hidden>
      <rect x="18" y="22" width="92" height="64" rx="12" {...common} fill="var(--paper)" />
      <path d="M32 42h50M32 54h36M32 66h44" {...common} stroke="var(--line-strong)" />
      <circle cx="108" cy="74" r="20" {...common} fill="var(--peach)" />
      <path d="M122 89l16 16" {...common} strokeWidth={4} />
      <path d="M100 74c2-6 12-6 14 0" {...common} stroke="var(--brand)" />
    </svg>
  );
}

export function EmptyBookmarkArt({ className = "h-24 w-32" }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 120" className={className} aria-hidden>
      <rect x="28" y="30" width="70" height="70" rx="12" {...common} fill="var(--paper)" strokeDasharray="5 6" stroke="var(--line-strong)" />
      <path d="M62 18h40a6 6 0 016 6v78l-26-16-26 16V24a6 6 0 016-6z" {...common} fill="var(--brand)" />
      <path d="M72 46l8 8 14-16" {...common} />
    </svg>
  );
}

export function EmptyHistoryArt({ className = "h-24 w-32" }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 120" className={className} aria-hidden>
      <circle cx="80" cy="60" r="38" {...common} fill="var(--paper)" />
      <circle cx="80" cy="60" r="28" fill="var(--peach)" stroke="none" />
      <path d="M80 40v20l13 9" {...common} />
      <path d="M38 34l-6 18 18 2" {...common} stroke="var(--brand)" />
    </svg>
  );
}

export function ErrorArt({ className = "h-20 w-28" }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 120" className={className} aria-hidden>
      <path d="M80 22l52 88H28z" {...common} fill="var(--paper)" />
      <path d="M80 54v26" {...common} stroke="var(--bad)" strokeWidth={4} />
      <circle cx="80" cy="94" r="2.8" fill="var(--bad)" />
    </svg>
  );
}
