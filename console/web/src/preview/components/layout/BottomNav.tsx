import { memo } from "react";
import { NavLink } from "react-router-dom";
import { BarChart3, Home, Sparkles, User } from "lucide-react";
import { cn } from "@pv/lib/utils";

interface BottomNavItem {
  to: string;
  label: string;
  icon: typeof Home;
}

const LEFT_ITEMS: BottomNavItem[] = [
  { to: "/preview/dashboard", label: "Home", icon: Home },
  { to: "/preview/agents", label: "Agenti", icon: Sparkles },
];

const RIGHT_ITEMS: BottomNavItem[] = [
  { to: "/preview/analytics", label: "Analisi", icon: BarChart3 },
  { to: "/preview/settings/profile", label: "Profilo", icon: User },
];

/**
 * Bottom navigation mobile (brief §2.1). Altezza 64px + safe-area bottom,
 * con un "buco" centrale occupato dal Fab. Visibile solo sotto lg.
 */
export const BottomNav = memo(function BottomNav() {
  const itemClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      "flex min-h-[44px] flex-1 flex-col items-center justify-center gap-1 rounded-lg px-1 py-1.5 text-[11px] font-medium transition-colors",
      isActive ? "text-pv-cyan" : "text-pv-ink-3 hover:text-pv-ink-2",
    );

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-pv-cyan/10 bg-pv-indigo/95 backdrop-blur-md lg:hidden"
      style={{
        height: "calc(var(--bottom-nav-height) + var(--safe-bottom))",
        paddingBottom: "var(--safe-bottom)",
      }}
      aria-label="Navigazione principale mobile"
    >
      {LEFT_ITEMS.map((item) => (
        <NavLink key={item.to} to={item.to} className={itemClass}>
          <item.icon className="h-5 w-5" aria-hidden="true" />
          {item.label}
        </NavLink>
      ))}

      {/* Spazio riservato al Fab centrale (56x56). */}
      <div className="w-16 shrink-0" aria-hidden="true" />

      {RIGHT_ITEMS.map((item) => (
        <NavLink key={item.to} to={item.to} className={itemClass}>
          <item.icon className="h-5 w-5" aria-hidden="true" />
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
});
