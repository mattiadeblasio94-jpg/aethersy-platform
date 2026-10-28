import { forwardRef, useId } from "react";
import type { ReactNode, SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@pv/lib/utils";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  hint?: string;
  options: SelectOption[];
  /** Icona a sinistra, coerente con Input. */
  leftIcon?: ReactNode;
}

/**
 * Select nativo stilizzato (brief §5.6: target >= 44px, testo >= 16px su
 * mobile). Mantiene il comportamento nativo per accessibilita' e mobile, con
 * l'estetica del design system.
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, error, hint, options, leftIcon, className, id, ...rest },
  ref,
) {
  const reactId = useId();
  const selectId = id ?? reactId;
  const describedById = error ? `${selectId}-error` : hint ? `${selectId}-hint` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={selectId} className="text-sm font-medium text-pv-ink-2">
          {label}
        </label>
      )}
      <div className="relative">
        {leftIcon && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-pv-ink-3">
            {leftIcon}
          </span>
        )}
        <select
          ref={ref}
          id={selectId}
          aria-invalid={Boolean(error)}
          aria-describedby={describedById}
          className={cn(
            "w-full appearance-none rounded-lg border bg-pv-indigo/60 py-2.5 pr-10 text-base text-pv-ink",
            "transition-colors focus:border-pv-cyan focus:outline-none focus:ring-1 focus:ring-pv-cyan",
            leftIcon ? "pl-10" : "pl-3.5",
            error ? "border-pv-error" : "border-pv-cyan/20",
            className,
          )}
          {...rest}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value} className="bg-pv-card text-pv-ink">
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-pv-ink-3"
          aria-hidden="true"
        />
      </div>
      {error ? (
        <p id={`${selectId}-error`} role="alert" className="text-sm text-pv-error">
          {error}
        </p>
      ) : hint ? (
        <p id={`${selectId}-hint`} className="text-sm text-pv-ink-3">
          {hint}
        </p>
      ) : null}
    </div>
  );
});
