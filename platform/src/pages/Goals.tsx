// =============================================================================
// Obiettivi (IA pazi "Goals"). Dati reali dal BFF: business.goal.
// Elenco filtrabile per stato, creazione e cambio stato (attivo/raggiunto),
// priorita' (1-5), metrica di misura e data target.
// =============================================================================

import { useMemo, useState } from "react";
import { Target, Trash2, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/Skeleton";
import { Tabs } from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/Toast";
import { EmptyState, KpiCard, PageHeader } from "@/components/common/PageElements";
import {
  useBusinessCatalog,
  useCreateGoal,
  useDeleteGoal,
  useGoals,
  useUpdateGoal,
} from "@/lib/platform-queries";
import { formatDate, formatNumber } from "@/lib/utils";

const STATUS_VARIANT: Record<string, "default" | "success" | "warning" | "error" | "info"> = {
  active: "info",
  achieved: "success",
  paused: "warning",
  abandoned: "error",
};

export default function Goals() {
  const { toast } = useToast();
  const [status, setStatus] = useState("all");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", metric: "", priority: 3 });

  const goals = useGoals(status === "all" ? undefined : status);
  const catalog = useBusinessCatalog();
  const createGoal = useCreateGoal();
  const updateGoal = useUpdateGoal();
  const deleteGoal = useDeleteGoal();

  const items = goals.data ?? [];

  const stats = useMemo(() => {
    const active = items.filter((g) => g.status === "active").length;
    const achieved = items.filter((g) => g.status === "achieved").length;
    const paused = items.filter((g) => g.status === "paused").length;
    return { total: items.length, active, achieved, paused };
  }, [items]);

  const statusLabel = (id: string) =>
    catalog.data?.goalStatuses.find((s) => s.id === id)?.label ?? id;

  const tabs = [
    { value: "all", label: "Tutti", badge: String(stats.total) },
    { value: "active", label: "Attivi", badge: String(stats.active) },
    { value: "achieved", label: "Raggiunti", badge: String(stats.achieved) },
    { value: "paused", label: "In pausa", badge: String(stats.paused) },
  ];

  function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    if (!form.title.trim()) return;
    createGoal.mutate(
      {
        title: form.title.trim(),
        description: form.description.trim(),
        metric: form.metric.trim(),
        priority: form.priority,
        status: "active",
      },
      {
        onSuccess: () => {
          toast({ kind: "success", title: "Obiettivo creato", description: form.title });
          setOpen(false);
          setForm({ title: "", description: "", metric: "", priority: 3 });
        },
        onError: (error) =>
          toast({ kind: "error", title: "Creazione fallita", description: error.message }),
      },
    );
  }

  function toggleAchieved(id: string, current: string) {
    const next = current === "achieved" ? "active" : "achieved";
    updateGoal.mutate(
      { id, body: { status: next } },
      {
        onSuccess: () =>
          toast({
            kind: "success",
            title: next === "achieved" ? "Obiettivo raggiunto" : "Obiettivo riaperto",
          }),
        onError: (error) =>
          toast({ kind: "error", title: "Aggiornamento fallito", description: error.message }),
      },
    );
  }

  function handleDelete(id: string) {
    deleteGoal.mutate(id, {
      onSuccess: () => toast({ kind: "info", title: "Obiettivo eliminato" }),
      onError: (error) =>
        toast({ kind: "error", title: "Eliminazione fallita", description: error.message }),
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Obiettivi"
        description="Cosa la piattaforma deve ottenere, con priorita', metrica di misura e data target."
        actions={
          <Button variant="primary" onClick={() => setOpen(true)}>
            Nuovo obiettivo
          </Button>
        }
      />

      <section aria-label="Statistiche obiettivi" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Obiettivi totali"
          value={formatNumber(stats.total)}
          icon={<Target className="h-5 w-5 text-secondary" aria-hidden="true" />}
        />
        <KpiCard
          label="Attivi"
          value={formatNumber(stats.active)}
          icon={<TrendingUp className="h-5 w-5 text-secondary" aria-hidden="true" />}
        />
        <KpiCard
          label="Raggiunti"
          value={formatNumber(stats.achieved)}
          hint="obiettivi chiusi"
        />
        <KpiCard label="In pausa" value={formatNumber(stats.paused)} hint="non ancora in corso" />
      </section>

      <Card className="flex flex-col gap-4">
        <Tabs items={tabs} value={status} onValueChange={setStatus} />
      </Card>

      {goals.isLoading ? (
        <Card bodyClassName="p-5">
          <Skeleton lines={6} />
        </Card>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Target className="h-5 w-5" aria-hidden="true" />}
          title="Nessun obiettivo"
          description="Definisci il primo obiettivo del workspace per orientare il lavoro degli agenti."
          action={
            <Button variant="primary" onClick={() => setOpen(true)}>
              Nuovo obiettivo
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {items.map((goal) => (
            <Card key={goal.id} className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-text-primary">{goal.title}</h2>
                  {goal.description && (
                    <p className="mt-1 text-sm text-text-secondary">{goal.description}</p>
                  )}
                </div>
                <Badge variant={STATUS_VARIANT[goal.status] ?? "default"}>
                  {statusLabel(goal.status)}
                </Badge>
              </div>

              <dl className="grid grid-cols-2 gap-3 text-xs text-text-muted">
                <div>
                  <dt className="font-medium text-text-secondary">Priorita'</dt>
                  <dd>{goal.priority}/5</dd>
                </div>
                <div>
                  <dt className="font-medium text-text-secondary">Data target</dt>
                  <dd>{goal.target_date ? formatDate(goal.target_date) : "—"}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="font-medium text-text-secondary">Metrica</dt>
                  <dd>{goal.metric || "—"}</dd>
                </div>
              </dl>

              <div className="flex flex-wrap items-center gap-2 border-t border-secondary/10 pt-3">
                <Button variant="secondary" size="sm" onClick={() => toggleAchieved(goal.id, goal.status)}>
                  {goal.status === "achieved" ? "Riapri" : "Segna raggiunto"}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Elimina obiettivo ${goal.title}`}
                  onClick={() => handleDelete(goal.id)}
                  className="text-text-muted hover:text-error"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Nuovo obiettivo"
        description="Obiettivo misurabile che gli agenti possono usare come riferimento."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Annulla
            </Button>
            <Button
              variant="primary"
              onClick={handleCreate}
              loading={createGoal.isPending}
              disabled={!form.title.trim()}
            >
              Crea
            </Button>
          </>
        }
      >
        <form className="flex flex-col gap-3" onSubmit={handleCreate}>
          <Input
            label="Titolo"
            value={form.title}
            onChange={(event) => setForm({ ...form, title: event.target.value })}
            placeholder="Ridurre il tempo di consegna del 20%"
          />
          <Input
            label="Descrizione"
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
            placeholder="Come si misura il risultato"
          />
          <Input
            label="Metrica"
            value={form.metric}
            onChange={(event) => setForm({ ...form, metric: event.target.value })}
            placeholder="Es. lead qualificati / mese"
          />
          <label className="flex flex-col gap-1 text-sm text-text-secondary">
            Priorita' (1 bassa - 5 alta)
            <input
              type="range"
              min={1}
              max={5}
              value={form.priority}
              onChange={(event) => setForm({ ...form, priority: Number(event.target.value) })}
              className="h-2 w-full cursor-pointer appearance-none rounded-full bg-bg-hover accent-secondary"
              aria-label="Priorita' obiettivo"
            />
            <span className="text-xs text-text-muted">{form.priority}</span>
          </label>
        </form>
      </Modal>
    </div>
  );
}
