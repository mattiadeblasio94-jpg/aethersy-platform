// =============================================================================
// Attivita' pianificate (IA pazi "Scheduled Tasks"). Dati reali dal BFF:
// edge platform.schedule (job ricorrenti) + platform.task (esecuzioni in corso).
// Pausa/riattivazione e cancellazione via PATCH/DELETE /api/platform/schedule/:id.
// =============================================================================

import { useMemo } from "react";
import { CalendarClock, ListChecks, Pause, Play, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { EmptyState, KpiCard, PageHeader } from "@/components/common/PageElements";
import {
  useDeleteSchedule,
  useSchedule,
  useTasks,
  useUpdateSchedule,
} from "@/lib/platform-queries";
import { formatDateTime, formatRelative, taskStatusLabel } from "@/lib/utils";

const STATUS_VARIANT: Record<string, "default" | "success" | "warning" | "error" | "info"> = {
  scheduled: "success",
  paused: "warning",
  done: "default",
  canceled: "error",
};

export default function ScheduledTasks() {
  const { toast } = useToast();
  const schedule = useSchedule();
  const tasks = useTasks();
  const updateSchedule = useUpdateSchedule();
  const deleteSchedule = useDeleteSchedule();

  const items = schedule.data ?? [];
  const taskRows = tasks.data ?? [];

  const stats = useMemo(() => {
    const active = items.filter((item) => item.status === "scheduled").length;
    const paused = items.filter((item) => item.status === "paused").length;
    const running = taskRows.filter((task) => task.status === "running").length;
    const pending = taskRows.filter((task) => task.status === "pending").length;
    const next = items
      .filter((item) => item.nextRunAt)
      .sort((a, b) => (a.nextRunAt! < b.nextRunAt! ? -1 : 1))[0];
    return { total: items.length, active, paused, running, pending, next };
  }, [items, taskRows]);

  function togglePause(id: string, status: string) {
    const next = status === "paused" ? "scheduled" : "paused";
    updateSchedule.mutate(
      { id, body: { status: next } },
      {
        onSuccess: () =>
          toast({
            kind: "success",
            title: next === "paused" ? "Attivita' in pausa" : "Attivita' riattivata",
          }),
        onError: (error) =>
          toast({ kind: "error", title: "Aggiornamento fallito", description: error.message }),
      },
    );
  }

  function handleDelete(id: string, title: string) {
    deleteSchedule.mutate(id, {
      onSuccess: () => toast({ kind: "info", title: "Attivita' eliminata", description: title }),
      onError: (error) =>
        toast({ kind: "error", title: "Eliminazione fallita", description: error.message }),
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Attivita' pianificate"
        description="Job ricorrenti e attivita' in esecuzione: ogni scadenza e' tracciata e metratizzata."
      />

      <section aria-label="Statistiche attivita'" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Attivita' pianificate"
          value={String(stats.total)}
          icon={<CalendarClock className="h-5 w-5 text-secondary" aria-hidden="true" />}
        />
        <KpiCard label="Attive" value={String(stats.active)} />
        <KpiCard label="In pausa" value={String(stats.paused)} />
        <KpiCard
          label="Prossima esecuzione"
          value={stats.next?.nextRunAt ? formatRelative(stats.next.nextRunAt) : "—"}
          hint={stats.next?.title}
        />
      </section>

      {schedule.isLoading ? (
        <Card bodyClassName="p-5">
          <Skeleton lines={5} />
        </Card>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<CalendarClock className="h-5 w-5" aria-hidden="true" />}
          title="Nessuna attivita' pianificata"
          description="Le attivita' ricorrenti create dagli agenti compariranno qui con cron e prossima esecuzione."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {items.map((item) => (
            <Card key={item.id} className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-text-primary">{item.title}</h2>
                  <p className="mt-1 text-xs uppercase tracking-wide text-text-muted">
                    {item.kind}
                    {item.stage ? ` · ${item.stage}` : ""}
                  </p>
                </div>
                <Badge variant={STATUS_VARIANT[item.status] ?? "default"}>{item.status}</Badge>
              </div>

              <dl className="grid grid-cols-2 gap-3 text-xs text-text-muted">
                <div>
                  <dt className="font-medium text-text-secondary">Pianificazione</dt>
                  <dd className="font-mono">{item.cron ?? item.runAt ?? "—"}</dd>
                </div>
                <div>
                  <dt className="font-medium text-text-secondary">Fuso orario</dt>
                  <dd>{item.timezone}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="font-medium text-text-secondary">Prossima esecuzione</dt>
                  <dd>{item.nextRunAt ? formatDateTime(item.nextRunAt) : "—"}</dd>
                </div>
              </dl>

              <div className="flex flex-wrap items-center gap-2 border-t border-secondary/10 pt-3">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => togglePause(item.id, item.status)}
                  loading={updateSchedule.isPending}
                >
                  {item.status === "paused" ? (
                    <>
                      <Play className="h-3.5 w-3.5" aria-hidden="true" /> Riattiva
                    </>
                  ) : (
                    <>
                      <Pause className="h-3.5 w-3.5" aria-hidden="true" /> Pausa
                    </>
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Elimina attivita' ${item.title}`}
                  onClick={() => handleDelete(item.id, item.title)}
                  className="text-text-muted hover:text-error"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Card bodyClassName="p-0">
        <div className="flex items-center gap-2 border-b border-secondary/10 px-5 py-4">
          <ListChecks className="h-4 w-4 text-secondary" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-text-primary">Attivita' in corso</h2>
          <Badge variant="default" className="ml-auto">
            {stats.running} in esecuzione · {stats.pending} in attesa
          </Badge>
        </div>
        {tasks.isLoading ? (
          <div className="p-5">
            <Skeleton lines={4} />
          </div>
        ) : taskRows.length === 0 ? (
          <p className="px-5 py-6 text-sm text-text-muted">Nessuna attivita' in esecuzione.</p>
        ) : (
          <ul className="divide-y divide-secondary/10">
            {taskRows.slice(0, 12).map((task) => (
              <li key={task.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <span className="text-sm text-text-primary">{task.title}</span>
                <span className="text-xs text-text-muted">{task.droid}</span>
                <Badge
                  variant={
                    task.status === "failed"
                      ? "error"
                      : task.status === "running"
                        ? "info"
                        : task.status === "done"
                          ? "success"
                          : "default"
                  }
                  className="ml-auto"
                >
                  {taskStatusLabel(task.status)}
                </Badge>
                <span className="text-xs text-text-muted">
                  {task.finishedAt
                    ? formatRelative(task.finishedAt)
                    : task.startedAt
                      ? formatRelative(task.startedAt)
                      : "—"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
