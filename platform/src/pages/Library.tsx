// =============================================================================
// Libreria — Risorse, Agenti, Messaggi, Inviti (4 sezioni).
// Real backend via /api/platform/library.
// =============================================================================

import { useState, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { FolderOpen, Bot, MessageSquare, Mail, Search, Filter, Download, Eye, Copy, Share2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Tabs } from "@/components/ui/Tabs";
import { PageHeader, EmptyState } from "@/components/common/PageElements";
import { PageTransition, StaggerGroup, StaggerItem } from "@/components/common/Motion";
import { useLibrary } from "@/lib/platform-queries";
import { formatDateTime } from "@/lib/utils";

const SECTION_TABS = [
  { value: "risorse", label: "Risorse", icon: FolderOpen },
  { value: "agenti", label: "Agenti", icon: Bot },
  { value: "messaggi", label: "Messaggi", icon: MessageSquare },
  { value: "inviti", label: "Inviti", icon: Mail },
] as const;

export default function Library() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(searchParams.get("tab") ?? "risorse");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("date");

  const library = useLibrary();

  // Sync tab with URL
  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    const params = new URLSearchParams(searchParams);
    params.set("tab", tab);
    setSearchParams(params);
  };

  // Sync search with URL (debounced)
  const handleSearchChange = (value: string) => {
    setSearch(value);
    const params = new URLSearchParams(searchParams);
    if (value) params.set("q", value);
    else params.delete("q");
    setSearchParams(params);
  };

  if (library.isLoading) {
    return (
      <PageTransition>
        <div className="p-4 lg:p-6">
          <PageHeader title="Libreria" description="Risorse, agenti, messaggi e inviti" />
          <div className="animate-pulse space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-20 bg-secondary/5 rounded-lg" />
            ))}
          </div>
        </div>
      </PageTransition>
    );
  }

  const data = library.data ?? { risorse: [], agenti: [], messaggi: [], inviti: [] };

  const filteredResources = useMemo(() => {
    let items = data.risorse;
    if (search) {
      const q = search.toLowerCase();
      items = items.filter((r) => r.name.toLowerCase().includes(q) || r.kind.toLowerCase().includes(q));
    }
    if (statusFilter !== "all") {
      items = items.filter((r) => r.status === statusFilter);
    }
    items.sort((a, b) => {
      if (sortBy === "date") return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "size") return 0; // size not available in API type
      return 0;
    });
    return items;
  }, [data.risorse, search, statusFilter, sortBy]);

  const filteredAgents = useMemo(() => {
    let items = data.agenti;
    if (search) {
      const q = search.toLowerCase();
      items = items.filter((a) => a.name.toLowerCase().includes(q) || a.role.toLowerCase().includes(q));
    }
    items.sort((a, b) => {
      if (sortBy === "date") return b.tasks - a.tasks;
      if (sortBy === "name") return a.name.localeCompare(b.name);
      return 0;
    });
    return items;
  }, [data.agenti, search, sortBy]);

  const filteredMessages = useMemo(() => {
    let items = data.messaggi;
    if (search) {
      const q = search.toLowerCase();
      items = items.filter((m) => m.content.toLowerCase().includes(q) || m.droid.toLowerCase().includes(q));
    }
    items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return items;
  }, [data.messaggi, search]);

  const filteredInvites = useMemo(() => {
    let items = data.inviti;
    if (search) {
      const q = search.toLowerCase();
      items = items.filter((i) => i.email.toLowerCase().includes(q) || i.role.toLowerCase().includes(q));
    }
    items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return items;
  }, [data.inviti, search]);

  const getEmptyMessage = () => {
    switch (activeTab) {
      case "risorse":
        return "Nessuna risorsa trovata. Le risorse appariranno qui dopo l'esecuzione dei run.";
      case "agenti":
        return "Nessun agente nel roster.";
      case "messaggi":
        return "Nessun messaggio. Inizia una conversazione con l'assistente.";
      case "inviti":
        return "Nessun invito inviato.";
      default:
        return "Nessun elemento.";
    }
  };

  return (
    <PageTransition>
      <div className="p-4 lg:p-6">
        <PageHeader
          title="Libreria"
          description="Risorse, agenti, messaggi e inviti del workspace"
          actions={
            <div className="flex items-center gap-2">
              <div className="relative hidden sm:block">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" aria-hidden="true" />
                <Input
                  value={search}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  placeholder="Cerca..."
                  className="pl-9 w-64"
                  aria-label="Cerca nella libreria"
                />
              </div>
              <Button variant="ghost" size="sm" className="hidden sm:flex items-center gap-1">
                <Filter className="h-4 w-4" aria-hidden="true" />
                Filtri
              </Button>
            </div>
          }
        />

        {/* Mobile search */}
        <div className="sm:hidden mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" aria-hidden="true" />
            <Input
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Cerca..."
              className="pl-9"
              aria-label="Cerca nella libreria"
            />
          </div>
        </div>

        {/* Tabs */}
        <Tabs
          items={SECTION_TABS.map((t) => ({ value: t.value, label: t.label }))}
          value={activeTab}
          onValueChange={handleTabChange}
          className="mb-4"
        />

        {/* Filters for Risorse */}
        {activeTab === "risorse" && (
          <div className="mb-4 flex flex-wrap gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-1.5 text-sm border border-secondary/20 rounded-lg bg-bg-card focus:outline-none focus:ring-2 focus:ring-secondary"
              aria-label="Filtro stato"
            >
              <option value="all">Tutti gli stati</option>
              <option value="approved">Approvate</option>
              <option value="pending">In attesa</option>
              <option value="draft">Bozza</option>
              <option value="delivered">Consegnate</option>
            </select>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="px-3 py-1.5 text-sm border border-secondary/20 rounded-lg bg-bg-card focus:outline-none focus:ring-2 focus:ring-secondary"
              aria-label="Ordina per"
            >
              <option value="date">Più recenti</option>
              <option value="name">Nome A-Z</option>
              <option value="size">Dimensione</option>
            </select>
          </div>
        )}

        {/* Content */}
        <section aria-label={`Libreria - ${SECTION_TABS.find((t) => t.value === activeTab)?.label}`}>
          {activeTab === "risorse" ? renderRisorse() : activeTab === "agenti" ? renderAgenti() : activeTab === "messaggi" ? renderMessaggi() : renderInviti()}
        </section>
      </div>
    </PageTransition>
  );

  function renderRisorse() {
    if (filteredResources.length === 0) {
      return (
        <Card>
          <EmptyState
            icon={<FolderOpen className="h-12 w-12 text-text-muted" aria-hidden="true" />}
            title="Libreria vuota"
            description={getEmptyMessage()}
          />
        </Card>
      );
    }
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <StaggerGroup>
          {filteredResources.map((resource) => (
            <StaggerItem key={resource.id}>
              <ResourceCard resource={resource} />
            </StaggerItem>
          ))}
        </StaggerGroup>
      </div>
    );
  }

  function renderAgenti() {
    if (filteredAgents.length === 0) {
      return (
        <Card>
          <EmptyState
            icon={<Bot className="h-12 w-12 text-text-muted" aria-hidden="true" />}
            title="Nessun agente"
            description={getEmptyMessage()}
          />
        </Card>
      );
    }
    return (
      <Card bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-secondary/10">
                <th className="text-left p-3 text-xs font-semibold text-text-muted uppercase tracking-wide">Agente</th>
                <th className="text-left p-3 text-xs font-semibold text-text-muted uppercase tracking-wide">Ruolo</th>
                <th className="text-left p-3 text-xs font-semibold text-text-muted uppercase tracking-wide">Dipartimento</th>
                <th className="text-right p-3 text-xs font-semibold text-text-muted uppercase tracking-wide">Task</th>
                <th className="text-right p-3 text-xs font-semibold text-text-muted uppercase tracking-wide">Stato</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-secondary/10">
              {filteredAgents.map((agent) => (
                <tr key={agent.id} className="hover:bg-secondary/5">
                  <td className="p-3">
                    <div className="flex items-center gap-3">
                      <div className="p-1.5 rounded-lg bg-secondary/10 text-secondary">
                        <Bot className="h-5 w-5" aria-hidden="true" />
                      </div>
                      <div>
                        <p className="font-medium text-text-primary">{agent.name}</p>
                        <p className="text-xs text-text-muted">{agent.department}</p>
                      </div>
                    </div>
                  </td>
                  <td className="p-3 text-sm text-text-secondary">{agent.role}</td>
                  <td className="p-3 text-sm text-text-secondary">{agent.department}</td>
                  <td className="p-3 text-right text-sm font-mono text-text-primary">{agent.tasks}</td>
                  <td className="p-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Badge variant={agent.running > 0 ? "info" : agent.failed > 0 ? "error" : "success"}>
                        {agent.running > 0 ? "Attivo" : agent.failed > 0 ? "Errori" : "Ok"}
                      </Badge>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    );
  }

  function renderMessaggi() {
    if (filteredMessages.length === 0) {
      return (
        <Card>
          <EmptyState
            icon={<MessageSquare className="h-12 w-12 text-text-muted" aria-hidden="true" />}
            title="Nessun messaggio"
            description={getEmptyMessage()}
          />
        </Card>
      );
    }
    return (
      <Card bodyClassName="p-0">
        <ul className="divide-y divide-secondary/10">
          {filteredMessages.map((msg) => (
            <li key={msg.id} className="p-4 hover:bg-secondary/5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="default" className="text-xs">{msg.droid}</Badge>
                    <span className="text-xs text-text-muted">{msg.role}</span>
                  </div>
                  <p className="text-sm text-text-primary line-clamp-2">{msg.content}</p>
                  <p className="mt-1 text-xs text-text-muted">{formatDateTime(msg.created_at)} · {msg.credits} crediti</p>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Copia">
                    <Copy className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    );
  }

  function renderInviti() {
    if (filteredInvites.length === 0) {
      return (
        <Card>
          <EmptyState
            icon={<Mail className="h-12 w-12 text-text-muted" aria-hidden="true" />}
            title="Nessun invito"
            description={getEmptyMessage()}
          />
        </Card>
      );
    }
    return (
      <Card bodyClassName="p-0">
        <ul className="divide-y divide-secondary/10">
          {filteredInvites.map((invite) => (
            <li key={invite.id} className="p-4 hover:bg-secondary/5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-secondary/10 text-secondary">
                    <Mail className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="font-medium text-text-primary">{invite.email}</p>
                    <p className="text-xs text-text-muted">{invite.role} · {formatDateTime(invite.created_at)}</p>
                  </div>
                </div>
                <Badge
                  variant={
                    invite.status === "accepted" ? "success" : invite.status === "pending" ? "warning" : "default"
                  }
                >
                  {invite.status}
                </Badge>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    );
  }
}

function ResourceCard({ resource }: { resource: { id: string; kind: string; name: string; status: string; storage_key: string; mime: string | null; version: number; created_at: string; run_id: string | null } }) {
  const statusVariant = resource.status === "approved" ? "success" : resource.status === "pending" ? "warning" : "default";

  return (
    <Card className="flex flex-col h-full group">
      <div className="p-3">
        <div className="flex items-start justify-between mb-2">
          <div className="p-2 rounded-lg bg-secondary/10 text-secondary">
            <FolderOpen className="h-5 w-5" aria-hidden="true" />
          </div>
          <Badge variant={statusVariant} className="text-xs">
            {resource.status}
          </Badge>
        </div>
        <p className="font-medium text-text-primary truncate mb-1">{resource.name}</p>
        <p className="text-xs text-text-muted mb-2">{resource.kind} · v{resource.version}</p>
        <div className="flex items-center justify-between text-xs text-text-muted">
          <span>{formatDateTime(resource.created_at)}</span>
          {/* size not available in API type */}
        </div>
      </div>
      <div className="border-t border-secondary/10 p-3 pt-2">
        <div className="flex items-center justify-end gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Visualizza">
            <Eye className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Scarica">
            <Download className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Condividi">
            <Share2 className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
