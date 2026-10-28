import { memo } from "react";
import { Link, useLocation } from "react-router-dom";
import { Bell, Menu } from "lucide-react";
import { useUiStore } from "@/store/ui";
import { useNotifications } from "@/lib/queries";
import { ThemeToggle } from "@/components/common/ThemeToggle";
import { cn } from "@/lib/utils";

/**
 * Header fisso in alto (brief §2.1): logo + wordmark, hamburger (apre il
 * drawer su mobile), badge notifiche. Su desktop l'hamburger diventa un
 * toggle sidebar gestito dal Shell.
 */
export const Header = memo(function Header() {
  const toggleDrawer = useUiStore((state) => state.toggleDrawer);
  const { data: notifications } = useNotifications();
  const location = useLocation();

  const unread = (notifications ?? []).filter((item) => !item.read).length;
  const isMarketing = location.pathname === "/landing";

  return (
    <header
      className="sticky top-0 z-40 flex items-center gap-3 border-b border-secondary/10 bg-primary/85 px-4 backdrop-blur-md lg:px-6"
      style={{ height: "var(--header-height)" }}
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

      <Link to="/dashboard" className="flex items-center gap-2.5" aria-label="Aethersy — Dashboard">
        <img src="/brand/logo-192.png" alt="" width={32} height={32} className="h-8 w-8" />
        <span className="wordmark text-lg font-semibold tracking-tight text-text-primary">
          AETHERSY
        </span>
      </Link>

      <div className="ml-auto flex items-center gap-2">
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

        <ThemeToggle />

        <button
          type="button"
          aria-label={
            unread > 0 ? `Notifiche, ${unread} non lette` : "Notifiche"
          }
          className="relative inline-flex h-11 w-11 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
        >
          <Bell className="h-5 w-5" aria-hidden="true" />
          {unread > 0 && (
            <span
              className={cn(
                "absolute right-2 top-2 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-tertiary px-1 text-[10px] font-bold text-accent-foreground",
              )}
            >
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </div>
    </header>
  );
});
