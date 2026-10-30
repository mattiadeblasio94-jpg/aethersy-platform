// =============================================================================
// Opportunità — Kanban board (running / ahead / done).
// Derivato da pipeline runs. Real backend via /api/platform/opportunities/kanban.
// =============================================================================

import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Plus, AlertTriangle, CheckCircle, Loader2, Send, Eye, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/common/PageElements";
import { PageTransition, StaggerGroup, StaggerItem } from "@/components/common/Motion";
import { useKanbanBoard, useSendMessage } from "@/lib/platform-queries";
import { formatDateTime, cn } from "@/lib/utils";

const BUCKET_ORDER = ["running", "ahead", "done"] as const;

const BUCKET_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string; bg: string }> = {
  running: {
    label: "In esecuzione",
    icon: <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />,
    color: "text-info",
    bg: "bg-info/10",
  },
  ahead: {
    label: "In anticipo",
    icon: <AlertTriangle className="h-5 w-5" aria-hidden="true" />,
    color: "text-warning",
    bg: "bg-warning/10",
  },
  done: {
    label: "Completate",
    icon: <CheckCircle className="h-5 w-5" aria-hidden="true" />,
    color: "text-success",
    bg: "bg-success/10",
  },
};

const STATE_CONFIG: Record<string, { label: string; variant: "default" | "info" | "warning" | "success" | "error" }> = {
  running: { label: "In esecuzione", variant: "info" },
  pending: { label: "In attesa", variant: "default" },
  approved: { label: "Approvato", variant: "success" },
  rejected: { label: "Rifiutato", variant: "error" },
  awaiting_human: { label: "In attesa di approvazione", variant: "warning" },
  completed: { label: "Completato", variant: "success" },
  failed: { label: "Fallito", variant: "error" },
};

export default function Opportunities() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [stageFilter, setStageFilter] = useState(searchParams.get("stage") ?? "all");
  const [showDetail, setShowDetail] = useState<string | null>(null);

  const kanban = useKanbanBoard(stageFilter !== "all" ? stageFilter : undefined);
  const sendMessage = useSendMessage();

  // Sync filter with URL
  const handleFilterChange = (stage: string) => {
    setStageFilter(stage);
    const params = new URLSearchParams(searchParams);
    if (stage === "all") params.delete("stage");
    else params.set("stage", stage);
    setSearchParams(params);
  };

  const handleOpenAssistant = (_runId: string, message: string) => {
    sendMessage.mutate({ text: message, conversationId: null });
    // In a real app, we'd also set conversation context
  };

  if (kanban.isLoading) {
    return (
      <PageTransition>
        <div className="p-4 lg:p-6">
          <PageHeader title="Opportunità" description="Kanban board delle esecuzioni" />
          <div className="grid gap-4 lg:grid-cols-3">
            {BUCKET_ORDER.map((bucket) => (
              <Card key={bucket} className="min-h-[400px]">
                <div className="animate-pulse space-y-4 p-4">
                  <div className="h-6 w-32 bg-secondary/10 rounded" />
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="h-24 bg-secondary/5 rounded-lg" />
                  ))}
                </div>
              </Card>
            ))}
          </div>
        </div>
      </PageTransition>
    );
  }

  const columns = kanban.data?.columns ?? [];

  return (
    <PageTransition>
      <div className="p-4 lg:p-6">
        <PageHeader
          title="Opportunità"
          description="Pipeline kanban: running → ahead → done"
          actions={
            <Button>
              <Link to="/studio" className="flex items-center gap-2">
                <Plus className="h-4 w-4" aria-hidden="true" />
                Nuova
              </Link>
            </Button>
          }
        />

        {/* Filter tabs */}
        <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Filtro stadio">
          <Button
            variant={stageFilter === "all" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => handleFilterChange("all")}
            role="tab"
            aria-selected={stageFilter === "all"}
          >
            Tutti
          </Button>
          <Button
            variant={stageFilter === "discovery" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => handleFilterChange("discovery")}
            role="tab"
            aria-selected={stageFilter === "discovery"}
          >
            Discovery
          </Button>
          <Button
            variant={stageFilter === "plan" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => handleFilterChange("plan")}
            role="tab"
            aria-selected={stageFilter === "plan"}
          >
            Piano
          </Button>
          <Button
            variant={stageFilter === "execute" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => handleFilterChange("execute")}
            role="tab"
            aria-selected={stageFilter === "execute"}
          >
            Esecuzione
          </Button>
          <Button
            variant={stageFilter === "review" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => handleFilterChange("review")}
            role="tab"
            aria-selected={stageFilter === "review"}
          >
            Revisione
          </Button>
        </div>

        {/* Kanban board */}
        <div className="grid gap-4 lg:grid-cols-3" role="region" aria-label="Kanban board">
          {BUCKET_ORDER.map((bucket) => {
            const column = columns.find((c) => c.bucket === bucket);
            const runs = column?.runs ?? [];
            const config = BUCKET_CONFIG[bucket];

            return (
              <Card key={bucket} className="min-h-[500px] flex flex-col">
                {/* Column header */}
                <div className="mb-3 flex items-center justify-between border-b border-secondary/10 pb-3">
                  <div className="flex items-center gap-2">
                    <span className={cn("p-2 rounded-lg", config.bg)}>{config.icon}</span>
                    <div>
                      <h3 className="font-medium text-text-primary">{config.label}</h3>
                      <p className="text-xs text-text-muted">{runs.length} elementi</p>
                    </div>
                  </div>
                </div>

                {/* Column content */}
                <div className="flex-1 overflow-y-auto space-y-3 min-h-[300px]">
                  {runs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-text-muted py-8">
                      <Sparkles className="h-10 w-10 text-secondary/50 mb-2" aria-hidden="true" />
                      <p className="text-sm">Nessuna opportunità</p>
                      <p className="text-xs">Trascina qui una card o crea una nuova</p>
                    </div>
                  ) : (
                    <StaggerGroup>
                      {runs.map((run) => (
                        <StaggerItem key={run.id}>
                          <OpportunityCard
                            run={run}
                            onClick={() => setShowDetail(run.id)}
                            onChat={(msg) => handleOpenAssistant(run.id, msg)}
                          />
                        </StaggerItem>
                      ))}
                    </StaggerGroup>
                  )}
                </div>
              </Card>
            );
          })}
        </div>

        {/* Detail drawer */}
        {showDetail && (
          <OpportunityDetail
            run={columns.flatMap((c) => c.runs).find((r) => r.id === showDetail)!}
            onClose={() => setShowDetail(null)}
          />
        )}
      </div>
    </PageTransition>
  );
}

function OpportunityCard({
  run,
  onClick,
  onChat,
}: {
  run: { id: string; stage: string; title: string; status: string; opportunity: { needsHuman: boolean; state: string; label: string; tone: string }; updated_at: string };
  onClick: () => void;
  onChat: (msg: string) => void;
}) {
  const stateConfig = STATE_CONFIG[run.opportunity.state] ?? { label: run.opportunity.state, variant: "default" };

  return (
    <div
      className="group cursor-pointer p-3 rounded-xl border border-secondary/10 bg-bg-card hover:border-secondary/30 hover:shadow-lg transition-all"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-text-primary truncate">{run.title}</p>
          <p className="mt-1 text-xs text-text-muted">{run.stage} · {formatDateTime(run.updated_at)}</p>
        </div>
        {run.opportunity.needsHuman && (
          <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-warning/10 text-warning">
            <AlertTriangle className="h-3 w-3" aria-hidden="true" />
            Attesa
          </span>
        )}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <Badge variant={stateConfig.variant} className="text-xs">
          {stateConfig.label}
        </Badge>
      </div>

      {/* Quick actions on hover */}
      <div className="mt-3 flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={(e) => { e.stopPropagation(); onChat(`Riassumi l'opportunità ${run.id}`); }}
          aria-label="Chiedi all'assistente"
        >
          <Send className="h-4 w-4" aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={(e) => { e.stopPropagation(); onClick(); }}
          aria-label="Apri dettagli"
        >
          <Eye className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

function OpportunityDetail({
  run,
  onClose,
}: {
  run: { id: string; stage: string; title: string; status: string; opportunity: { needsHuman: boolean; state: string; label: string; tone: string }; approved_by: string | null; created_at: string; updated_at: string };
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 lg:hidden" onClick={onClose} aria-hidden="true">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
      <div className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-bg-card shadow-xl overflow-y-auto" aria-label="Dettaglio opportunità">
        <div className="p-4 border-b border-secondary/10 flex items-center justify-between">
          <h2 className="font-medium text-text-primary">{run.title}</h2>
          <button onClick={onClose} className="p-2 text-text-muted hover:text-text-primary" aria-label="Chiudi">
            <span className="sr-only">Chiudi</span>
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <p className="text-xs text-text-muted">Stadio</p>
            <p className="font-medium text-text-primary">{run.stage}</p>
          </div>
          <div>
            <p className="text-xs text-text-muted">Stato</p>
            <p className="font-medium text-text-primary">{run.status}</p>
          </div>
          <div>
            <p className="text-xs text-text-muted">Stato opportunità</p>
            <p className="font-medium text-text-primary">{run.opportunity.label}</p>
          </div>
          {run.opportunity.needsHuman && (
            <div className="p-3 rounded-lg bg-warning/10 border border-warning/20">
              <p className="text-sm text-warning flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                In attesa di approvazione umana
              </p>
            </div>
          )}
          <div className="pt-4 border-t border-secondary/10">
            <p className="text-xs text-text-muted">Creato</p>
            <p className="font-mono text-sm text-text-primary">{formatDateTime(run.created_at)}</p>
          </div>
          <div>
            <p className="text-xs text-text-muted">Aggiornato</p>
            <p className="font-mono text-sm text-text-primary">{formatDateTime(run.updated_at)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
