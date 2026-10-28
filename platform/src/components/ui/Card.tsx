import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export type CardVariant = "default" | "elevated" | "outlined";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  as?: "div" | "section" | "article";
  header?: ReactNode;
  footer?: ReactNode;
  interactive?: boolean;
  /** Classi per il corpo (es. "p-0" per liste che gestiscono il proprio padding). */
  bodyClassName?: string;
}

const VARIANT_CLASSES: Record<CardVariant, string> = {
  default: "bg-bg-card border border-secondary/10 shadow-card",
  elevated: "bg-bg-card border border-secondary/15 shadow-glow",
  outlined: "bg-transparent border border-secondary/25",
};

export function Card({
  variant = "default",
  as: Tag = "div",
  header,
  footer,
  interactive = false,
  bodyClassName,
  className,
  children,
  ...rest
}: CardProps) {
  return (
    <Tag
      className={cn(
        "rounded-xl overflow-hidden",
        VARIANT_CLASSES[variant],
        interactive &&
          "transition-all duration-200 hover:border-secondary/40 hover:shadow-glow",
        className,
      )}
      {...rest}
    >
      {header && (
        <div className="flex items-center justify-between gap-3 border-b border-secondary/10 px-5 py-4">
          {header}
        </div>
      )}
      <div className={cn("px-5 py-4", bodyClassName)}>{children}</div>
      {footer && (
        <div className="border-t border-secondary/10 px-5 py-4">{footer}</div>
      )}
    </Tag>
  );
}
