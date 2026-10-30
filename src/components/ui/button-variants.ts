import { cva } from "class-variance-authority";

// Kept outside the client component so server components can use the classes.
// Primary uses charcoal text on orange: white on #FF6B35 fails WCAG contrast.
export const buttonVariants = cva(
  "relative inline-flex items-center justify-center gap-2 whitespace-nowrap font-semibold select-none transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-out active:translate-y-px active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "bg-brand text-ink shadow-[inset_0_-2px_0_rgba(0,0,0,0.12),0_6px_18px_-6px_rgba(255,107,53,0.65)] hover:bg-brand-hi hover:shadow-[inset_0_-2px_0_rgba(0,0,0,0.12),0_10px_26px_-8px_rgba(255,107,53,0.8)]",
        ink: "bg-ink text-white shadow-[inset_0_-2px_0_rgba(255,255,255,0.08)] hover:bg-[#333]",
        secondary: "bg-paper text-ink border border-line-strong shadow-[0_1px_0_rgba(32,24,16,0.04)] hover:border-ink/30 hover:bg-[#fffdfb]",
        ghost: "text-ink-2 hover:text-ink hover:bg-peach-soft",
        outline: "border border-line-strong text-ink hover:border-brand hover:bg-peach-soft",
        danger: "text-bad border border-bad/30 bg-paper hover:bg-bad-soft",
      },
      size: {
        sm: "h-8 rounded-[9px] px-3 text-[13px]",
        md: "h-10 rounded-[11px] px-4 text-sm",
        lg: "h-12 rounded-[13px] px-6 text-[15px]",
        icon: "size-9 rounded-[10px]",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);
