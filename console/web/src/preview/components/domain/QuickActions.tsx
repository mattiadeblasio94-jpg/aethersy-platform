import { Megaphone, Package, Share2, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { Card } from "@pv/components/ui/Card";
import { cn } from "@pv/lib/utils";

export interface QuickAction {
  id: string;
  label: string;
  description: string;
  to: string;
  icon: typeof Sparkles;
}

const DEFAULT_ACTIONS: QuickAction[] = [
  {
    id: "connect",
    label: "Collega piattaforma",
    description: "Aggiungi un nuovo canale social.",
    to: "/preview/social-media",
    icon: Share2,
  },
  {
    id: "agents",
    label: "Attiva un agente",
    description: "Automatizza una attivita' ricorrente.",
    to: "/preview/agents",
    icon: Sparkles,
  },
  {
    id: "campaign",
    label: "Crea campagna",
    description: "Lancia un annuncio a budget controllato.",
    to: "/preview/ads",
    icon: Megaphone,
  },
  {
    id: "product",
    label: "Aggiungi prodotto",
    description: "Pubblica un nuovo articolo nel catalogo.",
    to: "/preview/products",
    icon: Package,
  },
];

export interface QuickActionsProps {
  actions?: QuickAction[];
  className?: string;
}

/** Scorciatoie operative della Dashboard (brief §3.4). */
export function QuickActions({ actions = DEFAULT_ACTIONS, className }: QuickActionsProps) {
  return (
    <div className={cn("grid gap-3 sm:grid-cols-2", className)}>
      {actions.map((action) => (
        <Link key={action.id} to={action.to} className="group">
          <Card interactive className="flex h-full items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-pv-orange/15">
              <action.icon className="h-5 w-5 text-pv-orange" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-pv-ink">
                {action.label}
              </span>
              <span className="block text-sm text-pv-ink-3">{action.description}</span>
            </span>
          </Card>
        </Link>
      ))}
    </div>
  );
}
