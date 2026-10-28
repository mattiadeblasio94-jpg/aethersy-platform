// =============================================================================
// Agenti (brief §3.2) — rotta /agents. Filtri per stato, ricerca, creazione.
// =============================================================================

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bot, Plus, Search } from "lucide-react";
import { Button } from "@pv/components/ui/Button";
import { Card } from "@pv/components/ui/Card";
import { Input } from "@pv/components/ui/Input";
import { Tabs } from "@pv/components/ui/Tabs";
import { useToast } from "@pv/components/ui/Toast";
import { AgentList } from "@pv/components/domain/AgentList";
import { EmptyState, PageHeader } from "@pv/components/common/PageElements";
import { useActivateAgent, useAgents, usePauseAgent } from "@pv/lib/queries";
import type { AgentStatus } from "@pv/lib/types";

const FILTERS: { value: string; label: string }[] = [
  { value: "all", label: "Tutti" },
  { value: "active", label: "Attivi" },
  { value: "paused", label: "In pausa" },
  { value: "error", label: "Errore" },
];

export default function Agents() {
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const { toast } = useToast();

  const agents = useAgents();
  const activateAgent = useActivateAgent();
  const pauseAgent = usePauseAgent();

  const filtered = useMemo(() => {
    const list = agents.data ?? [];
    return list.filter((agent) => {
      const matchesStatus = filter === "all" || agent.status === (filter as AgentStatus);
      const matchesQuery =
        query.trim() === "" ||
        agent.name.toLowerCase().includes(query.trim().toLowerCase()) ||
        agent.description.toLowerCase().includes(query.trim().toLowerCase());
      return matchesStatus && matchesQuery;
    });
  }, [agents.data, filter, query]);

  const pendingId = activateAgent.isPending
    ? (activateAgent.variables ?? null)
    : pauseAgent.isPending
      ? (pauseAgent.variables ?? null)
      : null;

  async function handleActivate(agentId: string) {
    try {
      await activateAgent.mutateAsync(agentId);
      toast({ kind: "success", title: "Agente attivato" });
    } catch {
      toast({ kind: "error", title: "Attivazione non riuscita" });
    }
  }

  async function handlePause(agentId: string) {
    try {
      await pauseAgent.mutateAsync(agentId);
      toast({ kind: "info", title: "Agente messo in pausa" });
    } catch {
      toast({ kind: "error", title: "Operazione non riuscita" });
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Agenti"
        description="Configura gli agenti AI, scegli gli obiettivi e monitora le loro esecuzioni."
        actions={
          <Button
            variant="primary"
            leftIcon={<Plus className="h-4 w-4" aria-hidden="true" />}
            onClick={() => navigate("/preview/agents/create")}
          >
            Crea Agente
          </Button>
        }
      />

      <Card>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Tabs
            items={FILTERS.map((item) => ({ value: item.value, label: item.label }))}
            value={filter}
            onValueChange={setFilter}
          />
          <Input
            type="search"
            placeholder="Cerca agente…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            leftIcon={<Search className="h-4 w-4" aria-hidden="true" />}
            className="sm:max-w-xs"
          />
        </div>
      </Card>

      <AgentList
        agents={filtered}
        loading={agents.isLoading}
        pendingAgentId={pendingId}
        onActivate={handleActivate}
        onPause={handlePause}
        onOpen={(agentId) => navigate(`/agents/${agentId}`)}
        emptyMessage="Nessun agente corrisponde ai filtri."
      />

      {!agents.isLoading && (agents.data ?? []).length === 0 && (
        <EmptyState
          icon={<Bot className="h-5 w-5" aria-hidden="true" />}
          title="Nessun agente configurato"
          description="Crea il tuo primo agente per iniziare ad automatizzare il lavoro."
          action={
            <Button
              variant="primary"
              leftIcon={<Plus className="h-4 w-4" aria-hidden="true" />}
              onClick={() => navigate("/preview/agents/create")}
            >
              Crea Agente
            </Button>
          }
        />
      )}
    </div>
  );
}
