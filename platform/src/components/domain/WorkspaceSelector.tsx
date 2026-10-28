import { Building2, Check, ChevronsUpDown, Plus } from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import type { Workspace } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface WorkspaceSelectorProps {
  workspaces: Workspace[];
  activeWorkspaceId: string;
  onChange: (workspaceId: string) => void;
  onCreate?: () => void;
  className?: string;
}

const PLAN_LABELS: Record<Workspace["plan"], string> = {
  starter: "Starter",
  pro: "Pro",
  enterprise: "Enterprise",
};

/**
 * Selettore workspace (brief §2.1): mostra il workspace attivo e permette di
 * cambiarlo o crearne uno nuovo. Usa un dropdown Radix per accessibilita'.
 */
export function WorkspaceSelector({
  workspaces,
  activeWorkspaceId,
  onChange,
  onCreate,
  className,
}: WorkspaceSelectorProps) {
  const active = workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? workspaces[0];

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label="Seleziona workspace"
          className={cn(
            "flex w-full items-center gap-3 rounded-lg border border-secondary/15 bg-primary/50 px-3 py-2.5 text-left transition-colors hover:border-secondary/40 hover:bg-bg-hover",
            className,
          )}
        >
          {active?.logo ? (
            <img
              src={active.logo}
              alt=""
              width={32}
              height={32}
              className="h-8 w-8 rounded-md border border-secondary/20"
            />
          ) : (
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-bg-hover">
              <Building2 className="h-4 w-4 text-text-secondary" aria-hidden="true" />
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-text-primary">
              {active?.name ?? "Nessun workspace"}
            </span>
            <span className="block truncate text-xs text-text-muted">
              {active ? `${active.businessType} · ${PLAN_LABELS[active.plan]}` : "Crea il primo"}
            </span>
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={6}
          className="z-50 w-[var(--radix-dropdown-menu-trigger-width,16rem)] min-w-64 rounded-xl border border-secondary/20 bg-bg-card p-1.5 shadow-card data-[state=open]:animate-fade-in"
        >
          <DropdownMenu.Label className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
            Workspace
          </DropdownMenu.Label>
          {workspaces.map((workspace) => (
            <DropdownMenu.Item
              key={workspace.id}
              onSelect={() => onChange(workspace.id)}
              className="flex cursor-pointer select-none items-center gap-3 rounded-lg px-3 py-2 text-sm text-text-secondary outline-none transition-colors hover:bg-bg-hover hover:text-text-primary"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-bg-hover">
                <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate">{workspace.name}</span>
                <span className="block truncate text-xs text-text-muted">
                  {workspace.businessType}
                </span>
              </span>
              {workspace.id === active?.id && (
                <Check className="h-4 w-4 text-secondary" aria-hidden="true" />
              )}
            </DropdownMenu.Item>
          ))}

          {onCreate && (
            <>
              <DropdownMenu.Separator className="my-1.5 h-px bg-secondary/10" />
              <DropdownMenu.Item
                onSelect={onCreate}
                className="flex cursor-pointer select-none items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-secondary outline-none transition-colors hover:bg-bg-hover"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Nuovo workspace
              </DropdownMenu.Item>
            </>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
