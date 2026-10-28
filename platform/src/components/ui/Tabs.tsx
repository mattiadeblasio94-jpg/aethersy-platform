import type { ReactNode } from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

export interface TabItem {
  value: string;
  label: string;
  icon?: ReactNode;
  badge?: string;
}

export interface TabsProps {
  items: TabItem[];
  value: string;
  onValueChange: (value: string) => void;
  /** Contenuto per ciascun value. */
  panels?: Record<string, ReactNode>;
  className?: string;
}

export function Tabs({ items, value, onValueChange, panels, className }: TabsProps) {
  return (
    <TabsPrimitive.Root value={value} onValueChange={onValueChange} className={className}>
      <TabsPrimitive.List
        className="flex flex-wrap gap-1 rounded-xl border border-secondary/10 bg-primary/40 p-1"
        aria-label="Sezioni"
      >
        {items.map((item) => (
          <TabsPrimitive.Trigger
            key={item.value}
            value={item.value}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium",
              "text-text-secondary transition-colors hover:text-text-primary",
              "data-[state=active]:bg-secondary/15 data-[state=active]:text-secondary",
              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-secondary",
            )}
          >
            {item.icon}
            {item.label}
            {item.badge && (
              <span className="rounded-full bg-bg-hover px-1.5 text-xs text-text-secondary">
                {item.badge}
              </span>
            )}
          </TabsPrimitive.Trigger>
        ))}
      </TabsPrimitive.List>

      {panels &&
        items.map((item) => (
          <TabsPrimitive.Content
            key={item.value}
            value={item.value}
            className="mt-4 focus-visible:outline-none"
          >
            {panels[item.value]}
          </TabsPrimitive.Content>
        ))}
    </TabsPrimitive.Root>
  );
}
