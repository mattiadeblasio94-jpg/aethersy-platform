import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useLogout, useSession } from "../lib/query";

/**
 * Layout dell'area operativa (Console) dentro la piattaforma.
 *
 * Le rotte vivono sotto /console/* per non entrare in conflitto con le rotte
 * utente (/dashboard, /opportunities, /products...). Il design system e' quello
 * scuro della console originale: i token sono definiti in `.console-root`
 * (platform/src/index.css), quindi non toccano il tema della piattaforma.
 */

const nav = [
  { to: "/console/pulse", label: "Business Pulse", icon: "◈" },
  { to: "/console/goals", label: "Obiettivi", icon: "◬" },
  { to: "/console/memory", label: "Memoria", icon: "❂" },
  { to: "/console/products", label: "Prodotti & Servizi", icon: "▣" },
  { to: "/console/opportunities", label: "Opportunità", icon: "◎" },
  { to: "/console/schedule", label: "Tasks & Calendar", icon: "▦" },
  { to: "/console/agents", label: "Agenti", icon: "❖" },
  { to: "/console/pipeline", label: "Pipeline", icon: "⧗" },
  { to: "/console/leads", label: "Lead", icon: "✉" },
  { to: "/console/assets", label: "Libreria asset", icon: "◫" },
  { to: "/console/credits", label: "Crediti", icon: "◉" },
  { to: "/console/dashboard", label: "Dashboard", icon: "▤" },
  { to: "/console/flows", label: "Flows", icon: "⧉" },
  { to: "/console/runs", label: "Runs", icon: "▥" },
  { to: "/console/connections", label: "Connections", icon: "⚯" },
  { to: "/console/ai", label: "AI Center", icon: "✦" },
];

export function Layout() {
  const { data: user } = useSession();
  const logout = useLogout();
  const navigate = useNavigate();

  return (
    <div className="console-root flex min-h-screen">
      <aside className="sticky top-0 flex h-screen w-64 shrink-0 flex-col border-r border-[color:var(--color-border)] bg-[rgba(10,5,24,0.6)] px-3 py-4">
        <div className="mb-6 flex items-center gap-3 px-2">
          <img src="/brand/logo-192.png" alt="Aethersy" className="h-8 w-8" />
          <div className="leading-tight">
            <div className="wordmark text-lg font-semibold text-white">Aethersy</div>
            <div className="text-[11px] uppercase tracking-widest text-[color:var(--color-muted)]">
              Console
            </div>
          </div>
        </div>

        <nav className="flex flex-col gap-1">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
            >
              <span className="w-4 text-center text-[color:var(--color-primary)]">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto flex flex-col gap-3 px-2">
          <div className="text-xs text-[color:var(--color-muted)]">
            <div className="truncate text-white">{user?.email}</div>
            <div>{user?.platformRole ?? "MEMBER"}</div>
          </div>
          <button
            className="btn btn-ghost justify-center"
            onClick={() => logout.mutate(undefined, { onSuccess: () => navigate("/login") })}
          >
            Esci
          </button>
          <NavLink
            to="/dashboard"
            className="text-center text-[11px] text-[color:var(--color-muted)] hover:text-white"
          >
            Torna alla piattaforma
          </NavLink>
          <a
            className="text-center text-[11px] text-[color:var(--color-muted)] hover:text-white"
            href="https://app.aethersy.online"
            target="_blank"
            rel="noreferrer"
          >
            Apri Activepieces (admin) ↗
          </a>
        </div>
      </aside>

      <main className="min-w-0 flex-1 p-8">
        <Outlet />
      </main>
    </div>
  );
}
