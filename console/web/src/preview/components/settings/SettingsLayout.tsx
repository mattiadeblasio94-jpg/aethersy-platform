// =============================================================================
// Layout condiviso delle Impostazioni (brief §4). Fornisce l'intestazione di
// sezione e la sotto-navigazione orizzontale (profilo, fatturazione,
// integrazioni, notifiche) riusata da tutte le pagine /settings/*.
// =============================================================================

import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { CreditCard, Plug, Settings as SettingsIcon, User } from "lucide-react";
import { PageHeader } from "@pv/components/common/PageElements";
import { cn } from "@pv/lib/utils";

interface SettingsNavItem {
  to: string;
  label: string;
  icon: typeof User;
}

const SETTINGS_NAV: SettingsNavItem[] = [
  { to: "/preview/settings/profile", label: "Profilo", icon: User },
  { to: "/preview/settings/billing", label: "Fatturazione", icon: CreditCard },
  { to: "/preview/settings/integrations", label: "Integrazioni", icon: Plug },
  { to: "/preview/settings/notifications", label: "Notifiche", icon: SettingsIcon },
];

export interface SettingsLayoutProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}

/** Contenitore standard delle pagine Impostazioni con sotto-navigazione. */
export function SettingsLayout({ title, description, actions, children }: SettingsLayoutProps) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Impostazioni"
        description="Gestisci profilo, piano, integrazioni e notifiche del workspace."
      />

      <nav aria-label="Sezioni impostazioni" className="-mt-1">
        <ul className="flex flex-wrap gap-1 rounded-xl border border-pv-cyan/10 bg-pv-indigo/40 p-1">
          {SETTINGS_NAV.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    "inline-flex min-h-[44px] items-center gap-2 rounded-lg px-3.5 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-pv-cyan/15 text-pv-cyan"
                      : "text-pv-ink-2 hover:bg-pv-hover hover:text-pv-ink",
                  )
                }
              >
                <item.icon className="h-4 w-4" aria-hidden="true" />
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <section aria-label={title} className="flex flex-col gap-6">
        <header>
          <h2 className="font-display text-xl font-semibold text-pv-ink">{title}</h2>
          {description && <p className="mt-1 text-sm text-pv-ink-2">{description}</p>}
        </header>

        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}

        {children}
      </section>
    </div>
  );
}
