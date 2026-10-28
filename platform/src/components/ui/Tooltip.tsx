import type { ReactNode } from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";

export interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  delayMs?: number;
}

/** Tooltip accessibile basato su Radix: contenuto annunciato via aria-describedby. */
export function Tooltip({ content, children, side = "top", delayMs = 300 }: TooltipProps) {
  return (
    <TooltipPrimitive.Provider delayDuration={delayMs}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side={side}
            sideOffset={6}
            className="z-50 max-w-xs rounded-lg border border-secondary/20 bg-bg-card px-3 py-1.5 text-xs text-text-primary shadow-card data-[state=delayed-open]:animate-fade-in"
          >
            {content}
            <TooltipPrimitive.Arrow className="fill-bg-card" />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
