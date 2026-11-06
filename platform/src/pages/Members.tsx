// =============================================================================
// Membri (IA pazi "Members"). Dati reali dal BFF: edge platform.library ->
// library.invites (utenti del tenant, metering.tenant_user). Nessun nuovo
// endpoint necessario: gli inviti sono gia' esposti dalla BFF.
// =============================================================================

import { useMemo, useState } from "react";
import { Mail, ShieldCheck, UserCheck, UserPlus } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState, KpiCard, PageHeader } from "@/components/common/PageElements";
import { useLibrary } from "@/lib/platform-queries";
import { formatDate } from "@/lib/utils";

const STATUS_VARIANT: Record<string, "default" | "success" | "warning" | "error" | "info"> = {
  active: "success",
  invited: "warning",
  pending: "warning",
  suspended: "error",
  disabled: "default",
};

const ROLE_LABEL: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Membro",
  viewer: "Viewer",
  agent: "Agente",
};

export default function Members() {
  const [search, setSearch] = useState("");
  const library = useLibrary();

  const invites = library.data?.inviti ?? [];

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return invites;
    return invites.filter(
      (invite) =>
        invite.email.toLowerCase().includes(query) ||
        (invite.role ?? "").toLowerCase().includes(query) ||
        (invite.status ?? "").toLowerCase().includes(query),
    );
  }, [invites, search]);

  const stats = useMemo(() => {
    const active = invites.filter((invite) => invite.status === "active").length;
    const pending = invites.filter((invite) =>
      ["invited", "pending"].includes(invite.status),
    ).length;
    const owners = invites.filter((invite) => invite.role === "owner").length;
    return { total: invites.length, active, pending, owners };
  }, [invites]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Membri"
        description="Persone e ruoli attivi nel workspace: la stessa lista che governa accessi e crediti."
      />

      <section aria-label="Statistiche membri" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Membri"
          value={String(stats.total)}
          icon={<UserCheck className="h-5 w-5 text-secondary" aria-hidden="true" />}
        />
        <KpiCard label="Attivi" value={String(stats.active)} />
        <KpiCard
          label="Inviti in attesa"
          value={String(stats.pending)}
          icon={<Mail className="h-5 w-5 text-secondary" aria-hidden="true" />}
        />
        <KpiCard
          label="Owner"
          value={String(stats.owners)}
          icon={<ShieldCheck className="h-5 w-5 text-secondary" aria-hidden="true" />}
        />
      </section>

      <Card className="flex flex-col gap-4">
        <Input
          type="search"
          placeholder="Cerca per email o ruolo…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          leftIcon={<UserPlus className="h-4 w-4" aria-hidden="true" />}
          aria-label="Cerca membri"
        />
      </Card>

      {library.isLoading ? (
        <Card bodyClassName="p-5">
          <Skeleton lines={6} />
        </Card>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<UserPlus className="h-5 w-5" aria-hidden="true" />}
          title="Nessun membro trovato"
          description="Gli utenti invitati nel workspace compariranno qui con ruolo e stato."
        />
      ) : (
        <Card bodyClassName="p-0">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-secondary/10 text-xs uppercase tracking-wide text-text-muted">
              <tr>
                <th scope="col" className="px-5 py-3 font-medium">
                  Email
                </th>
                <th scope="col" className="px-5 py-3 font-medium">
                  Ruolo
                </th>
                <th scope="col" className="px-5 py-3 font-medium">
                  Stato
                </th>
                <th scope="col" className="px-5 py-3 font-medium">
                  Ingresso
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-secondary/10">
              {filtered.map((invite) => (
                <tr key={invite.id}>
                  <td className="px-5 py-3 text-text-primary">{invite.email}</td>
                  <td className="px-5 py-3 text-text-secondary">
                    {ROLE_LABEL[invite.role] ?? invite.role}
                  </td>
                  <td className="px-5 py-3">
                    <Badge variant={STATUS_VARIANT[invite.status] ?? "default"}>
                      {invite.status}
                    </Badge>
                  </td>
                  <td className="px-5 py-3 text-text-muted">{formatDate(invite.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
