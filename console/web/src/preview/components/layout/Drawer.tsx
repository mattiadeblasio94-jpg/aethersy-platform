import { memo, useMemo } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import {
  BarChart3,
  HelpCircle,
  Home,
  Megaphone,
  Package,
  Send,
  Settings,
  Share2,
  Sparkles,
  Users,
  Globe,
  X,
} from "lucide-react";
import { useUiStore } from "@pv/store/ui";
import { useAuthStore } from "@pv/store/auth";
import { useAgents, usePlatforms, useTasks, useWorkspaces } from "@pv/lib/queries";
import { WorkspaceSelector } from "@pv/components/domain/WorkspaceSelector";
import { CreditDisplay } from "@pv/components/domain/CreditDisplay";
import { CountBadge } from "@pv/components/ui/Badge";
import { cn } from "@pv/lib/utils";

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
  const activeWorkspaceId = useUiStore((state) => state.activeWorkspaceId);
  const setActiveWorkspace = useUiStore((state) => state.setActiveWorkspace);
  const customWorkspaces = useUiStore((state) => state.customWorkspaces);
  const { data: remoteWorkspaces } = useWorkspaces();
  const { data: agents } = useAgents();
  const { data: platforms } = usePlatforms();
  const { data: tasks } = useTasks();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();
  // Il drawer mobile non deve scorrere se l'utente preferisce meno movimento.
  const reduceMotion = useReducedMotion();

  // I workspace creati in onboarding precedono quelli remoti nel selettore.
  const workspaces = useMemo(
    () => [...customWorkspaces, ...(remoteWorkspaces ?? [])],
    [customWorkspaces, remoteWorkspaces],
  );

  const sections = useMemo<NavSection[]>(() => {
    const activeTasks = (tasks ?? []).filter(
      (task) => task.status === "pending" || task.status === "running",
    ).length;
    const connectedPlatforms = (platforms ?? []).filter(
      (platform) => platform.status === "connected",
    ).length;
    const activeAgents = (agents ?? []).filter((agent) => agent.status === "active").length;

    return [
      {
        title: "Operazioni",
        items: [
          { to: "/preview/dashboard", label: "Dashboard", icon: Home, badge: 3 },
          { to: "/preview/agents", label: "Agenti", icon: Sparkles, badge: activeAgents },
          {
            to: "/preview/social-media",
            label: "Social Media",
            icon: Share2,
            badge: connectedPlatforms,
          },
          { to: "/preview/tasks", label: "Task", icon: Users, badge: activeTasks },
          { to: "/preview/outreach", label: "Outreach", icon: Send },
        ],
      },
      {
        title: "Crescita",
        items: [
          { to: "/preview/website", label: "Sito Web", icon: Globe },
          { to: "/preview/ads", label: "Annunci", icon: Megaphone },
          { to: "/preview/products", label: "Prodotti", icon: Package },
          { to: "/preview/analytics", label: "Analisi", icon: BarChart3 },
        ],
      },
    ];
  }, [agents, platforms, tasks]);

  const secondaryItems: NavItem[] = [
    { to: "/preview/settings", label: "Impostazioni", icon: Settings },
    { to: "/preview/help", label: "Aiuto", icon: HelpCircle },
  ];

  const content = (
    <div
      id="aethersy-drawer"
      className={cn(
        "flex h-full w-[var(--drawer-width)] flex-col bg-pv-indigo",
        variant === "mobile" ? "border-r border-pv-cyan/10" : "border-r border-pv-cyan/10",
      )}
    >
      <div className="flex items-center gap-2.5 px-4" style={{ height: "var(--header-height)" }}>
        <img src="/brand/logo-192.png" alt="" width={28} height={28} className="h-7 w-7" />
        <span className="wordmark text-base font-semibold text-pv-ink">AETHERSY</span>
        {variant === "mobile" && (
          <button
            type="button"
            onClick={closeDrawer}
            aria-label="Chiudi menu"
            className="ml-auto inline-flex h-11 w-11 items-center justify-center rounded-lg text-pv-ink-3 transition-colors hover:bg-pv-hover hover:text-pv-ink"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        )}
      </div>

      <div className="border-t border-pv-cyan/10 px-3 py-3">
        <WorkspaceSelector
          workspaces={workspaces}
          activeWorkspaceId={activeWorkspaceId}
          onChange={setActiveWorkspace}
          onCreate={() => navigate("/preview/onboarding")}
        />
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-3" aria-label="Navigazione principale">
        {sections.map((section) => (
          <div key={section.title} className="mb-3">
            <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-pv-ink-3">
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
                      ? "bg-pv-cyan/15 text-pv-cyan shadow-[inset_2px_0_0_var(--color-pv-cyan)]"
                      : "text-pv-ink-2 hover:bg-pv-hover hover:text-pv-ink",
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

        <div className="mb-3 border-t border-pv-cyan/10 pt-3">
          {secondaryItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={variant === "mobile" ? closeDrawer : undefined}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-pv-cyan/15 text-pv-cyan"
                    : "text-pv-ink-2 hover:bg-pv-hover hover:text-pv-ink",
                )
              }
            >
              <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>

      <div className="border-t border-pv-cyan/10 p-3">
        <div className="mb-3 flex items-center gap-3 px-1">
          <img
            src={user?.avatar ?? "/brand/logo-192.png"}
            alt=""
            width={36}
            height={36}
            className="h-9 w-9 rounded-full border border-pv-cyan/20"
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-pv-ink">
              {user?.name ?? "Ospite"}
            </p>
            <p className="truncate text-xs text-pv-ink-3">{user?.email ?? "—"}</p>
          </div>
        </div>

        <CreditDisplay
          amount={user?.credits ?? 1250}
          showUpgrade
          onUpgradeClick={() => navigate("/preview/settings/billing")}
        />

        <button
          type="button"
          onClick={() => {
            logout();
            if (variant === "mobile") closeDrawer();
            navigate("/login");
          }}
          className="mt-2 w-full rounded-lg px-3 py-2 text-left text-sm text-pv-ink-3 transition-colors hover:bg-pv-hover hover:text-pv-ink"
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
