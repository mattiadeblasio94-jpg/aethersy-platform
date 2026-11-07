import { memo, useMemo } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Bell, CreditCard, LogOut, Menu, User, ChevronDown } from "lucide-react";
import { useUiStore } from "@/store/ui";
import { useAuthStore } from "@/store/auth";
import { useBalance, useSchedule } from "@/lib/platform-queries";
import { ThemeToggle } from "@/components/common/ThemeToggle";
import { Button } from "@/components/ui/Button";
import { Dropdown, DropdownItem } from "@/components/ui/Dropdown";
import { cn, formatNumber } from "@/lib/utils";

/**
 * Header fisso in alto (brief §2.1): logo + wordmark, hamburger (apre il
 * drawer su mobile), badge notifiche, crediti, avatar utente.
 */
export const Header = memo(function Header() {
  const toggleDrawer = useUiStore((state) => state.toggleDrawer);
  const location = useLocation();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const balance = useBalance();
  const schedule = useSchedule();

  const pending = useMemo(
    () => (schedule.data ?? []).filter((item) => item.status === "scheduled").length,
    [schedule.data],
  );
  const isMarketing = location.pathname === "/landing";

  const pageTitle = useMemo(() => {
    const path = location.pathname;
    if (path === "/dashboard") return "Home";
    if (path === "/studio") return "Studio";
    if (path.startsWith("/agents")) return "Agenti";
    if (path.startsWith("/social-media")) return "Social media";
    if (path.startsWith("/tasks")) return "Task";
    if (path.startsWith("/outreach")) return "Outreach";
    if (path.startsWith("/website")) return "Sito web";
    if (path.startsWith("/ads")) return "Annunci";
    if (path.startsWith("/products")) return "Prodotti";
    if (path.startsWith("/analytics")) return "Analisi";
    if (path.startsWith("/settings")) return "Impostazioni";
    if (path === "/help") return "Aiuto";
    if (path === "/opportunities") return "Opportunità";
    if (path === "/library") return "Libreria";
    if (path === "/subscription") return "Abbonamento";
    return "Aethersy";
  }, [location.pathname]);

  const initials = user?.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "U";

  const dropdownItems: DropdownItem[] = [
    {
      id: "profile",
      label: "Profilo",
      icon: <User className="h-4 w-4" aria-hidden="true" />,
      onSelect: () => navigate("/settings/profile"),
    },
    {
      id: "billing",
      label: "Abbonamento",
      icon: <CreditCard className="h-4 w-4" aria-hidden="true" />,
      onSelect: () => navigate("/settings/billing"),
    },
    {
      id: "subscription-faq",
      label: "Abbonamento (FAQ)",
      icon: <CreditCard className="h-4 w-4" aria-hidden="true" />,
      onSelect: () => navigate("/subscription"),
    },
    {
      id: "logout",
      label: "Esci",
      icon: <LogOut className="h-4 w-4" aria-hidden="true" />,
      onSelect: () => logout(),
      destructive: true,
    },
  ];

  return (
    <header
      className="sticky top-0 z-40 h-16 flex items-center gap-4 border-b border-secondary/10 bg-primary/85 px-4 backdrop-blur-md lg:px-6"
    >
      <button
        type="button"
        onClick={toggleDrawer}
        aria-label="Apri menu di navigazione"
        aria-controls="aethersy-drawer"
        className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary lg:hidden"
      >
        <Menu className="h-5 w-5" aria-hidden="true" />
      </button>

      <Link to="/dashboard" className="flex items-center gap-2.5" aria-label="Aethersy — Home">
        <img src="/brand/logo-192.png" alt="" width={32} height={32} className="h-8 w-8" />
        <span className="wordmark text-lg font-semibold tracking-tight text-text-primary">
          AETHERSY
        </span>
      </Link>

      <h1 className="font-display text-lg font-semibold text-text-primary lg:text-xl flex-1 truncate hidden sm:block">
        {pageTitle}
      </h1>

      <div className="ml-auto flex items-center gap-3">
        {isMarketing && (
          <nav className="hidden items-center gap-1 sm:flex" aria-label="Navigazione marketing">
            <a
              href="#funzionalita"
              className="rounded-lg px-3 py-2 text-sm text-text-secondary transition-colors hover:text-text-primary"
            >
              Funzionalita'
            </a>
            <a
              href="#prezzi"
              className="rounded-lg px-3 py-2 text-sm text-text-secondary transition-colors hover:text-text-primary"
            >
              Prezzi
            </a>
          </nav>
        )}

        {balance.data && (
          <Link
            to="/settings/billing"
            className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary/10 hover:bg-secondary/20 transition-colors"
            title="Vai a Fatturazione"
          >
            <CreditCard className="h-4 w-4 text-secondary" aria-hidden="true" />
            <span className="text-sm font-mono font-medium text-text-primary">
              {formatNumber(balance.data.available ?? 0)} crediti
            </span>
          </Link>
        )}

        <ThemeToggle />

        <Link
          to="/scheduled-tasks"
          aria-label={
            pending > 0 ? `Attività pianificate, ${pending} da eseguire` : "Attività pianificate"
          }
          className="relative inline-flex h-11 w-11 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary lg:hidden"
        >
          <Bell className="h-5 w-5" aria-hidden="true" />
          {pending > 0 && (
            <span
              className={cn(
                "absolute right-2 top-2 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-tertiary px-1 text-[10px] font-bold text-accent-foreground",
              )}
            >
              {pending > 9 ? "9+" : pending}
            </span>
          )}
        </Link>

        {user && (
          <Dropdown
            trigger={
              <Button variant="ghost" className="flex items-center gap-2 px-2 py-1" aria-label="Menu utente">
                <div className="h-8 w-8 rounded-full bg-secondary/20 flex items-center justify-center text-sm font-medium text-secondary">
                  {initials}
                </div>
                <span className="hidden sm:block text-sm font-medium text-text-primary">
                  {user.name ?? user.email}
                </span>
                <ChevronDown className="h-4 w-4 text-text-muted" aria-hidden="true" />
              </Button>
            }
            items={dropdownItems}
            align="end"
            label="Menu utente"
          />
        )}
      </div>
    </header>
  );
});
