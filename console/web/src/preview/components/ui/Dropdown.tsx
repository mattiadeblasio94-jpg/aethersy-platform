import type { ReactNode } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { cn } from "@pv/lib/utils";

export interface DropdownItem {
  id: string;
  label: string;
  icon?: ReactNode;
  onSelect?: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

export interface DropdownProps {
  trigger: ReactNode;
  items: DropdownItem[];
  align?: "start" | "end";
  label?: string;
}

export function Dropdown({ trigger, items, align = "end", label }: DropdownProps) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align={align}
          sideOffset={6}
          aria-label={label}
          className="z-50 min-w-[200px] rounded-xl border border-pv-cyan/20 bg-pv-card p-1.5 shadow-pv-card data-[state=open]:animate-fade-in"
        >
          {items.map((item) => (
            <DropdownMenu.Item
              key={item.id}
              disabled={item.disabled}
              onSelect={item.onSelect}
              className={cn(
                "flex cursor-pointer select-none items-center gap-2.5 rounded-lg px-3 py-2 text-sm outline-none",
                "text-pv-ink-2 transition-colors",
                item.destructive
                  ? "hover:bg-pv-error/15 hover:text-pv-error"
                  : "hover:bg-pv-hover hover:text-pv-ink",
                "data-[disabled]:pointer-events-none data-[disabled]:opacity-40",
              )}
            >
              {item.icon}
              {item.label}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
