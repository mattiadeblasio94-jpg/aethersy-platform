import { memo } from "react";
import { Link } from "react-router-dom";
import { Bell, Menu } from "lucide-react";
import { useUiStore } from "@pv/store/ui";
import { useNotifications } from "@pv/lib/queries";
import { cn } from "@pv/lib/utils";

/**
 * Header fisso in alto (brief §2.1): logo + wordmark, hamburger (apre il
 * drawer su mobile), badge notifiche. Su desktop l'hamburger diventa un
 * toggle sidebar gestito dal Shell.
 */
export const Header = memo(function Header() {
  const toggleDrawer = useUiStore((state) => state.toggleDrawer);
  const { data: notifications } = useNotifications();

  const unread = (notifications ?? []).filter((item) => !item.read).length;

  return (
    <header
      className="sticky top-0 z-40 flex items-center gap-3 border-b border-pv-cyan/10 bg-pv-indigo/85 px-4 backdrop-blur-md lg:px-6"
      style={{ height: "var(--header-height)" }}
    >
      <button
        type="button"
        onClick={toggleDrawer}
        aria-label="Apri menu di navigazione"
        aria-controls="aethersy-drawer"
        className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-pv-ink-2 transition-colors hover:bg-pv-hover hover:text-pv-ink lg:hidden"
      >
        <Menu className="h-5 w-5" aria-hidden="true" />
      </button>

      <Link to="/preview/dashboard" className="flex items-center gap-2.5" aria-label="Aethersy — Dashboard">
        <img src="/brand/logo-192.png" alt="" width={32} height={32} className="h-8 w-8" />
        <span className="wordmark text-lg font-semibold tracking-tight text-pv-ink">
          AETHERSY
        </span>
      </Link>

      <div className="ml-auto flex items-center gap-2">
        <Link
          to="/"
          className="hidden rounded-lg px-3 py-2 text-sm text-pv-ink-2 transition-colors hover:text-pv-ink sm:block"
        >
          Torna alla Console
        </Link>

        <button
          type="button"
          aria-label={
            unread > 0 ? `Notifiche, ${unread} non lette` : "Notifiche"
          }
          className="relative inline-flex h-11 w-11 items-center justify-center rounded-lg text-pv-ink-2 transition-colors hover:bg-pv-hover hover:text-pv-ink"
        >
          <Bell className="h-5 w-5" aria-hidden="true" />
          {unread > 0 && (
            <span
              className={cn(
                "absolute right-2 top-2 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-pv-orange px-1 text-[10px] font-bold text-pv-accent-ink",
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
