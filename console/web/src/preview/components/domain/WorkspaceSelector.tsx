import { Building2, Check, ChevronsUpDown, Plus } from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import type { Workspace } from "@pv/lib/types";
import { cn } from "@pv/lib/utils";

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
            "flex w-full items-center gap-3 rounded-lg border border-pv-cyan/15 bg-pv-indigo/50 px-3 py-2.5 text-left transition-colors hover:border-pv-cyan/40 hover:bg-pv-hover",
            className,
          )}
        >
          {active?.logo ? (
            <img
              src={active.logo}
              alt=""
              width={32}
              height={32}
              className="h-8 w-8 rounded-md border border-pv-cyan/20"
            />
          ) : (
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-pv-hover">
              <Building2 className="h-4 w-4 text-pv-ink-2" aria-hidden="true" />
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-pv-ink">
              {active?.name ?? "Nessun workspace"}
            </span>
            <span className="block truncate text-xs text-pv-ink-3">
              {active ? `${active.businessType} · ${PLAN_LABELS[active.plan]}` : "Crea il primo"}
            </span>
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-pv-ink-3" aria-hidden="true" />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={6}
          className="z-50 w-[var(--radix-dropdown-menu-trigger-width,16rem)] min-w-64 rounded-xl border border-pv-cyan/20 bg-pv-card p-1.5 shadow-pv-card data-[state=open]:animate-fade-in"
        >
          <DropdownMenu.Label className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-pv-ink-3">
            Workspace
          </DropdownMenu.Label>
          {workspaces.map((workspace) => (
            <DropdownMenu.Item
              key={workspace.id}
              onSelect={() => onChange(workspace.id)}
              className="flex cursor-pointer select-none items-center gap-3 rounded-lg px-3 py-2 text-sm text-pv-ink-2 outline-none transition-colors hover:bg-pv-hover hover:text-pv-ink"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-pv-hover">
                <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate">{workspace.name}</span>
                <span className="block truncate text-xs text-pv-ink-3">
                  {workspace.businessType}
                </span>
              </span>
              {workspace.id === active?.id && (
                <Check className="h-4 w-4 text-pv-cyan" aria-hidden="true" />
              )}
            </DropdownMenu.Item>
          ))}

          {onCreate && (
            <>
              <DropdownMenu.Separator className="my-1.5 h-px bg-pv-cyan/10" />
              <DropdownMenu.Item
                onSelect={onCreate}
                className="flex cursor-pointer select-none items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-pv-cyan outline-none transition-colors hover:bg-pv-hover"
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
