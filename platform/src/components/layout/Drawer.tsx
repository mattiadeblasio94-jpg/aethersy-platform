import { memo, useMemo } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import {
  BarChart3,
  Bot,
  Brain,
  CalendarClock,
  CalendarDays,
  Coins,
  HelpCircle,
  Home,
  Megaphone,
  MessageSquare,
  Package,
  Send,
  Settings,
  Share2,
  Sparkles,
  Target,
  FolderOpen,
  UserCheck,
  Users,
  Wallet,
  Globe,
  LayoutDashboard,
  X,
  Zap,
  Bell,
  Plug,
  Rocket,
  Search,
  BookOpen,
  ShieldCheck,
} from "lucide-react";
import { useUiStore } from "@/store/ui";
import { useAuthStore } from "@/store/auth";
import {
  useAccount,
  useBalance,
  useOverview,
  usePlatforms,
  useRoster,
} from "@/lib/platform-queries";
import { CreditDisplay } from "@/components/domain/CreditDisplay";
import { CountBadge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";

interface NavItem {
  to: string;
  label: string;
  icon: typeof Home;
  badge?: number;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

export interface DrawerProps {
  /** Su desktop (>=1024px) il drawer e' sempre visibile come sidebar. */
  variant: "mobile" | "desktop";
}

/**
 * Drawer / Sidebar (brief §2.1). Slide-in da sinistra su mobile con overlay
 * sfocato; su desktop e' una sidebar persistente larga 280px.
 */
export const Drawer = memo(function Drawer({ variant }: DrawerProps) {
  const closeDrawer = useUiStore((state) => state.closeDrawer);
  const user = useAuthStore((state) => state.user);
  const isAdmin = useAuthStore((state) => state.isAdmin);
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();

  const account = useAccount();
  const balance = useBalance();
  const overview = useOverview();
  const platforms = usePlatforms();
  const roster = useRoster();

  const sections = useMemo<NavSection[]>(() => {
    const counters = overview.data?.counters;
    const connectedPlatforms = (platforms.data ?? []).filter((platform) => platform.connected).length;
    const activeAgents = (roster.data ?? []).filter((entry) => entry.running > 0).length;
    const activeTasks = (counters?.tasks.pending ?? 0) + (counters?.tasks.running ?? 0);

    return [
      {
        title: "Operazioni",
        items: [
          { to: "/dashboard", label: "Home", icon: Home },
          { to: "/guida", label: "Guida", icon: BookOpen },
          { to: "/overview", label: "Panoramica", icon: LayoutDashboard },
          { to: "/jarvis", label: "Jarvis", icon: Bot },
          { to: "/studio", label: "Studio", icon: Zap },
          { to: "/idea", label: "Realizza l'idea", icon: Rocket },
          { to: "/research", label: "Ricerca", icon: Search },
          { to: "/specialisti", label: "Specialisti", icon: Sparkles },
          { to: "/agents", label: "Agenti", icon: Bot, badge: activeAgents },
          { to: "/opportunities", label: "Opportunità", icon: Target, badge: counters?.runs.open ?? 0 },
          { to: "/library", label: "Libreria", icon: FolderOpen },
          { to: "/outreach", label: "Outreach", icon: Send },
          { to: "/social-media", label: "Social Media", icon: Share2, badge: connectedPlatforms },
          { to: "/connectors", label: "Connettori", icon: Plug },
          { to: "/wix", label: "Wix", icon: Globe },
          { to: "/tasks", label: "Task", icon: Users, badge: activeTasks },
        ],
      },
      {
        title: "Controllo",
        items: [
          { to: "/goals", label: "Obiettivi", icon: Target },
          { to: "/notifications", label: "Notifiche", icon: Bell },
          { to: "/scheduled-tasks", label: "Attività", icon: CalendarClock },
          { to: "/content-calendar", label: "Calendario", icon: CalendarDays },
          { to: "/inbox", label: "Inbox", icon: MessageSquare },
          { to: "/skills", label: "Competenze", icon: Sparkles },
          { to: "/members", label: "Membri", icon: UserCheck },
          { to: "/payouts", label: "Pagamenti", icon: Coins },
          { to: "/memory", label: "Memoria", icon: Brain },
          { to: "/account", label: "Account", icon: Wallet },
          ...(isAdmin
            ? [{ to: "/admin", label: "Pannello", icon: ShieldCheck }]
            : []),
        ],
      },
      {
        title: "Crescita",
        items: [
          { to: "/website", label: "Sito Web", icon: Globe },
          { to: "/ads", label: "Annunci", icon: Megaphone },
          { to: "/products", label: "Prodotti", icon: Package },
          { to: "/analytics", label: "Analisi", icon: BarChart3 },
        ],
      },
    ];
  }, [overview.data, platforms.data, roster.data, isAdmin]);

  const secondaryItems: NavItem[] = [
    { to: "/console/pulse", label: "Console operativa", icon: LayoutDashboard },
    { to: "/settings", label: "Impostazioni", icon: Settings },
    { to: "/help", label: "Aiuto", icon: HelpCircle },
  ];

  const content = (
    <div
      id="aethersy-drawer"
      className={cn(
        "flex h-full w-[var(--drawer-width)] flex-col bg-primary",
        variant === "mobile" ? "border-r border-secondary/10" : "border-r border-secondary/10",
      )}
    >
      <div className="flex items-center gap-2.5 px-4" style={{ height: "var(--header-height)" }}>
        <img src="/brand/logo-192.png" alt="Aethersy" width={28} height={28} className="h-7 w-7" />
        {variant === "mobile" && (
          <button
            type="button"
            onClick={closeDrawer}
            aria-label="Chiudi menu"
            className="ml-auto inline-flex h-11 w-11 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        )}
      </div>

      <div className="border-t border-secondary/10 px-3 py-3">
        <div className="rounded-lg border border-secondary/10 bg-primary/40 px-3 py-2.5">
          <p className="truncate text-sm font-medium text-text-primary">
            {account.data?.tenantName ?? "Workspace"}
          </p>
          <p className="truncate text-xs text-text-muted">
            {account.data?.plan ? `Piano ${account.data.plan}` : "Nessun piano attivo"}
          </p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-3" aria-label="Navigazione principale">
        {sections.map((section) => (
          <div key={section.title} className="mb-3">
            <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
              {section.title}
            </p>
            {section.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={variant === "mobile" ? closeDrawer : undefined}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-secondary/15 text-secondary shadow-[inset_2px_0_0_var(--aethersy-secondary)]"
                      : "text-text-secondary hover:bg-bg-hover hover:text-text-primary",
                  )
                }
              >
                <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                {item.label}
                {item.badge != null && <CountBadge count={item.badge} />}
              </NavLink>
            ))}
          </div>
        ))}

        <div className="mb-3 border-t border-secondary/10 pt-3">
          {secondaryItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={variant === "mobile" ? closeDrawer : undefined}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-secondary/15 text-secondary"
                    : "text-text-secondary hover:bg-bg-hover hover:text-text-primary",
                )
              }
            >
              <item.icon className="h-4 w-4" aria-hidden="true" />
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>

      <div className="border-t border-secondary/10 p-3">
        <div className="mb-3 flex items-center gap-3 px-1">
          <img
            src={user?.avatar ?? "/brand/logo-192.png"}
            alt=""
            width={36}
            height={36}
            className="h-9 w-9 rounded-full border border-secondary/20"
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-text-primary">
              {user?.name ?? "Ospite"}
            </p>
            <p className="truncate text-xs text-text-muted">{user?.email ?? "—"}</p>
          </div>
        </div>

        <CreditDisplay
          amount={balance.data?.available ?? user?.credits ?? 0}
          showUpgrade
          onUpgradeClick={() => navigate("/settings/billing")}
        />

        <button
          type="button"
          onClick={() => {
            logout();
            if (variant === "mobile") closeDrawer();
            navigate("/login");
          }}
          className="mt-2 w-full rounded-lg px-3 py-2 text-left text-sm text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
        >
          Esci
        </button>
      </div>
    </div>
  );

  if (variant === "desktop") {
    return (
      <aside className="hidden lg:block" aria-label="Sidebar">
        {content}
      </aside>
    );
  }

  return (
    <motion.aside
      initial={{ x: reduceMotion ? 0 : "-100%" }}
      animate={{ x: 0 }}
      exit={{ x: reduceMotion ? 0 : "-100%" }}
      transition={{ duration: reduceMotion ? 0 : 0.25, ease: "easeOut" }}
      className="fixed inset-y-0 left-0 z-50 lg:hidden"
      aria-label="Menu di navigazione"
    >
      {content}
    </motion.aside>
  );
});
