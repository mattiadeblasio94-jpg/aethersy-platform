import * as SwitchPrimitive from "@radix-ui/react-switch";
import { cn } from "@pv/lib/utils";

export interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
  id?: string;
}

export function Switch({
  checked,
  onCheckedChange,
  label,
  description,
  disabled,
  id,
}: SwitchProps) {
  const control = (
    <SwitchPrimitive.Root
      id={id}
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full",
        "border border-pv-cyan/20 transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        "data-[state=checked]:bg-pv-cyan/70 data-[state=unchecked]:bg-pv-hover",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pv-cyan",
      )}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          "block h-5 w-5 translate-x-0.5 rounded-full border border-black/10 bg-white shadow transition-transform",
          "data-[state=checked]:translate-x-[22px]",
        )}
      />
    </SwitchPrimitive.Root>
  );

  if (!label) return control;

  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <label htmlFor={id} className="cursor-pointer text-sm font-medium text-pv-ink">
          {label}
        </label>
        {description && <p className="text-sm text-pv-ink-3">{description}</p>}
      </div>
      {control}
    </div>
  );
}
