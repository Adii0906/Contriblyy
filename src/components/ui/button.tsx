"use client";

import { Slot } from "@radix-ui/react-slot";
import type { VariantProps } from "class-variance-authority";
import { buttonVariants } from "./button-variants";
import * as React from "react";
import { cn } from "@/lib/utils";


export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild, ...props }, ref) => {
  const Comp = asChild ? Slot : "button";
  return <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
});
Button.displayName = "Button";

export { buttonVariants };
