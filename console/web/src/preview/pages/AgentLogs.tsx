// =============================================================================
// Log agente (brief §3.2) — rotta /agents/:agentId/logs. Tabella con filtro per
// livello, ricerca, paginazione client-side ed export mock.
// =============================================================================

import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Download, FileText, Search } from "lucide-react";
import { Card } from "@pv/components/ui/Card";
import { Badge } from "@pv/components/ui/Badge";
import { Button } from "@pv/components/ui/Button";
import { Input } from "@pv/components/ui/Input";
import { Skeleton } from "@pv/components/ui/Skeleton";
import { Tabs } from "@pv/components/ui/Tabs";
import { useToast } from "@pv/components/ui/Toast";
import { EmptyState, PageHeader } from "@pv/components/common/PageElements";
import { useAgentDetail, useAgentLogs } from "@pv/lib/queries";
import type { LogLevel } from "@pv/lib/types";
import { formatDuration, formatDateTime } from "@pv/lib/utils";

const LEVELS: { value: string; label: string }[] = [
  { value: "all", label: "Tutti" },
  { value: "info", label: "Info" },
  { value: "warn", label: "Avvisi" },
  { value: "error", label: "Errori" },
];

const LEVEL_VARIANT: Record<LogLevel, "info" | "warning" | "error"> = {
  info: "info",
  warn: "warning",
  error: "error",
};

const PAGE_SIZE = 12;

export default function AgentLogs() {
  const { agentId = "" } = useParams<{ agentId: string }>();
  const { toast } = useToast();

  const [level, setLevel] = useState("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const detail = useAgentDetail(agentId);
  const logs = useAgentLogs(agentId);

  const filtered = useMemo(() => {
    const list = logs.data ?? [];
    return list.filter((log) => {
      const matchesLevel = level === "all" || log.level === (level as LogLevel);
      const matchesQuery =
        query.trim() === "" || log.message.toLowerCase().includes(query.trim().toLowerCase());
      return matchesLevel && matchesQuery;
    });
  }, [logs.data, level, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function handleExport() {
    toast({
      kind: "info",
      title: "Export in preparazione",
      description: `${filtered.length} righe di log esportate in CSV (mock).`,
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <Link
        to={`/agents/${agentId}`}
        className="inline-flex w-fit items-center gap-1.5 text-sm text-pv-ink-3 transition-colors hover:text-pv-ink"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {detail.data?.agent.name ?? "Agente"}
      </Link>

      <PageHeader
        title="Log di esecuzione"
        description="Cronologia completa delle operazioni dell'agente, con filtri per livello."
        actions={
          <Button
            variant="secondary"
            leftIcon={<Download className="h-4 w-4" aria-hidden="true" />}
            onClick={handleExport}
          >
            Esporta
          </Button>
        }
      />

      <Card>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Tabs
            items={LEVELS.map((item) => ({ value: item.value, label: item.label }))}
            value={level}
            onValueChange={(value) => {
              setLevel(value);
              setPage(1);
            }}
          />
          <Input
            type="search"
            placeholder="Cerca messaggio…"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
            leftIcon={<Search className="h-4 w-4" aria-hidden="true" />}
            className="sm:max-w-xs"
          />
        </div>
      </Card>

      <Card
        header={
          <>
            <h2 className="text-base font-semibold text-pv-ink">Righe di log</h2>
            <span className="text-xs text-pv-ink-3">{filtered.length} risultati</span>
          </>
        }
        bodyClassName="p-0"
      >
        {logs.isLoading ? (
          <div className="p-5">
            <Skeleton lines={6} />
          </div>
        ) : pageItems.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={<FileText className="h-5 w-5" aria-hidden="true" />}
              title="Nessun log"
              description="Nessuna riga corrisponde ai filtri selezionati."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <caption className="sr-only">Log di esecuzione dell'agente</caption>
              <thead>
                <tr className="border-b border-pv-cyan/10 text-left text-xs text-pv-ink-3">
                  <th scope="col" className="py-2 pl-5 pr-4 font-medium">Data e ora</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Livello</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Messaggio</th>
                  <th scope="col" className="py-2 pr-5 font-medium text-right">Durata</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((log) => (
                  <tr key={log.id} className="border-b border-pv-cyan/5">
                    <td className="whitespace-nowrap py-3 pl-5 pr-4 text-pv-ink-3">
                      {formatDateTime(log.timestamp)}
                    </td>
                    <td className="py-3 pr-4">
                      <Badge variant={LEVEL_VARIANT[log.level]}>{log.level.toUpperCase()}</Badge>
                    </td>
                    <td className="py-3 pr-4 text-pv-ink">{log.message}</td>
                    <td className="whitespace-nowrap py-3 pr-5 text-right text-pv-ink-2">
                      {formatDuration(log.durationMs)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between gap-3 px-5 py-4">
            <p className="text-xs text-pv-ink-3">
              Pagina {currentPage} di {totalPages}
            </p>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={currentPage <= 1}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
              >
                Precedente
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={currentPage >= totalPages}
                onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
              >
                Successiva
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
