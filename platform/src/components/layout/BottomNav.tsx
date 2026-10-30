import { memo } from "react";
import { NavLink } from "react-router-dom";
import { BarChart3, Home, User, Bot, FolderOpen, Target, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

interface BottomNavItem {
  to: string;
  label: string;
  icon: typeof Home;
}

const BOTTOM_NAV_ITEMS: BottomNavItem[] = [
  { to: "/dashboard", label: "Home", icon: Home },
  { to: "/studio", label: "Studio", icon: Zap },
  { to: "/agents", label: "Agenti", icon: Bot },
  { to: "/opportunities", label: "Opportunità", icon: Target },
  { to: "/library", label: "Libreria", icon: FolderOpen },
] as const;

/**
 * Bottom navigation mobile (brief §2.1). Altezza 64px + safe-area bottom,
 * con un "buco" centrale occupato dal Fab. Visibile solo sotto lg.
 */
export const BottomNav = memo(function BottomNav() {
  const itemClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      "flex min-h-[44px] flex-1 flex-col items-center justify-center gap-1 rounded-lg px-1 py-1.5 text-[11px] font-medium transition-colors",
      isActive ? "text-secondary" : "text-text-muted hover:text-text-secondary",
    );

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-secondary/10 bg-primary/95 backdrop-blur-md lg:hidden"
      style={{
        height: "calc(var(--bottom-nav-height) + var(--safe-bottom))",
        paddingBottom: "var(--safe-bottom)",
      }}
      aria-label="Navigazione principale mobile"
    >
      <div className="flex-1 flex">
        {BOTTOM_NAV_ITEMS.map((item) => (
          <NavLink key={item.to} to={item.to} className={itemClass}>
            <item.icon className="h-5 w-5" aria-hidden="true" />
            {item.label}
          </NavLink>
        ))}
      </div>

      {/* Spazio riservato al Fab centrale (56x56). */}
      <div className="w-16 shrink-0" aria-hidden="true" />

      <div className="flex-1 flex justify-end">
        <NavLink to="/analytics" className={itemClass}>
          <BarChart3 className="h-5 w-5" aria-hidden="true" />
          Analisi
        </NavLink>
        <NavLink to="/settings/profile" className={itemClass}>
          <User className="h-5 w-5" aria-hidden="true" />
          Profilo
        </NavLink>
      </div>
    </nav>
  );
});
