import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@pv/lib/utils";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg" | "icon";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  fullWidth?: boolean;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  // Testo scuro sul gradiente accent (cyan/arancio): contrasto garantito in
  // entrambi i temi (pv-accent-ink).
  primary:
    "gradient-accent text-pv-accent-ink font-semibold shadow-pv-glow hover:brightness-110 active:brightness-95",
  secondary:
    "bg-pv-hover text-pv-ink hover:bg-pv-hover-2 border border-pv-cyan/20",
  ghost:
    "bg-transparent text-pv-ink-2 hover:text-pv-ink hover:bg-pv-hover/60 border border-transparent",
  danger: "bg-pv-error/15 text-pv-error border border-pv-error/40 hover:bg-pv-error/25",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  // Touch target minimo 44px (brief §5.6)
  sm: "h-11 px-3 text-sm gap-1.5",
  md: "h-11 px-4 text-sm gap-2",
  lg: "h-12 px-6 text-base gap-2",
  icon: "h-11 w-11 justify-center",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    loading = false,
    leftIcon,
    rightIcon,
    fullWidth = false,
    className,
    children,
    disabled,
    type = "button",
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading}
      className={cn(
        "inline-flex items-center justify-center rounded-lg transition-all duration-150",
        "disabled:cursor-not-allowed disabled:opacity-50",
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        fullWidth && "w-full",
        className,
      )}
      {...rest}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : (
        leftIcon
      )}
      {children}
      {!loading && rightIcon}
    </button>
  );
});
