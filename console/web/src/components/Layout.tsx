import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useLogout, useSession } from "../lib/query";

const nav = [
  { to: "/", label: "Dashboard", icon: "◈" },
  { to: "/flows", label: "Flows", icon: "⧉" },
  { to: "/runs", label: "Runs", icon: "▤" },
  { to: "/pipeline", label: "Pipeline", icon: "⧗" },
  { to: "/assets", label: "Libreria asset", icon: "◫" },
  { to: "/credits", label: "Crediti", icon: "◎" },
  { to: "/connections", label: "Connections", icon: "⚯" },
  { to: "/ai", label: "AI Center", icon: "✦" },
];

export function Layout() {
  const { data: user } = useSession();
  const logout = useLogout();
  const navigate = useNavigate();

  return (
    <div className="flex h-full">
      <aside className="flex w-64 shrink-0 flex-col border-r border-[--color-border] bg-[rgba(10,5,24,0.6)] px-3 py-4">
        <div className="mb-6 flex items-center gap-3 px-2">
          <img src="/brand/logo-192.png" alt="Aethersy" className="h-8 w-8" />
          <div className="leading-tight">
            <div className="wordmark text-lg font-semibold text-white">Aethersy</div>
            <div className="text-[11px] uppercase tracking-widest text-[--color-muted]">
              Console
            </div>
          </div>
        </div>

        <nav className="flex flex-col gap-1">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
            >
              <span className="w-4 text-center text-[--color-primary]">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto flex flex-col gap-3 px-2">
          <div className="text-xs text-[--color-muted]">
            <div className="truncate text-white">{user?.email}</div>
            <div>{user?.platformRole ?? "MEMBER"}</div>
          </div>
          <button
            className="btn btn-ghost justify-center"
            onClick={() => logout.mutate(undefined, { onSuccess: () => navigate("/login") })}
          >
            Esci
          </button>
          <a
            className="text-center text-[11px] text-[--color-muted] hover:text-white"
            href="https://app.aethersy.online"
            target="_blank"
            rel="noreferrer"
          >
            Apri Activepieces (admin) ↗
          </a>
        </div>
      </aside>

      <main className="flex-1 overflow-auto p-8">
        <Outlet />
      </main>
    </div>
  );
}
