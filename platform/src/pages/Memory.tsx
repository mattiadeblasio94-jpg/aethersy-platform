// =============================================================================
// Memoria (IA pazi "Memory"). Dati reali dal BFF: business.memory.
// Archivio di fatti, note, preferenze, vincoli, decisioni e contatti, con
// ricerca testuale, filtro per tipo e pin dei contenuti operativi.
// =============================================================================

import { useMemo, useState } from "react";
import { Brain, FileText, Link2, Pin, PinOff, Search, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { EmptyState, KpiCard, PageHeader } from "@/components/common/PageElements";
import {
  useBusinessCatalog,
  useCreateMemory,
  useDeleteMemory,
  useMemory,
  useUpdateMemory,
} from "@/lib/platform-queries";
import { formatRelative } from "@/lib/utils";

const KIND_VARIANT: Record<string, "default" | "success" | "warning" | "error" | "info" | "accent"> = {
  fact: "info",
  note: "default",
  preference: "accent",
  constraint: "warning",
  decision: "success",
  contact: "default",
};

export default function Memory() {
  const { toast } = useToast();
  const [kind, setKind] = useState("all");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    kind: "fact",
    title: "",
    content: "",
    source: "",
    path: "",
  });

  const memory = useMemory({
    ...(kind === "all" ? {} : { kind }),
    ...(search.trim() ? { search: search.trim() } : {}),
  });
  const catalog = useBusinessCatalog();
  const createMemory = useCreateMemory();
  const updateMemory = useUpdateMemory();
  const deleteMemory = useDeleteMemory();

  const items = memory.data ?? [];

  const stats = useMemo(
    () => ({
      total: items.length,
      pinned: items.filter((m) => m.pinned).length,
      kinds: new Set(items.map((m) => m.kind)).size,
    }),
    [items],
  );

  const kindLabel = (id: string) =>
    catalog.data?.memoryKinds.find((k) => k.id === id)?.label ?? id;

  function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    if (!form.title.trim() || !form.content.trim()) return;
    createMemory.mutate(
      {
        kind: form.kind,
        title: form.title.trim(),
        content: form.content.trim(),
        ...(form.path.trim() ? { path: form.path.trim() } : {}),
        source: form.source.trim() || "manuale",
      },
      {
        onSuccess: () => {
          toast({ kind: "success", title: "Nota salvata", description: form.title });
          setOpen(false);
          setForm({ kind: "fact", title: "", content: "", source: "", path: "" });
        },
        onError: (error) =>
          toast({ kind: "error", title: "Salvataggio fallito", description: error.message }),
      },
    );
  }

  function togglePin(id: string, pinned: boolean) {
    updateMemory.mutate(
      { id, body: { pinned: !pinned } },
      {
        onSuccess: () =>
          toast({ kind: "success", title: pinned ? "Nota sbloccata" : "Nota fissata" }),
        onError: (error) =>
          toast({ kind: "error", title: "Aggiornamento fallito", description: error.message }),
      },
    );
  }

  function handleDelete(id: string) {
    deleteMemory.mutate(id, {
      onSuccess: () => toast({ kind: "info", title: "Nota eliminata" }),
      onError: (error) =>
        toast({ kind: "error", title: "Eliminazione fallita", description: error.message }),
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Memoria"
        description="Il contesto condiviso del workspace: fatti, preferenze, vincoli e decisioni."
        actions={
          <Button variant="primary" onClick={() => setOpen(true)}>
            Nuova nota
          </Button>
        }
      />

      <section aria-label="Statistiche memoria" className="grid gap-4 sm:grid-cols-3">
        <KpiCard
          label="Voci"
          value={String(stats.total)}
          icon={<Brain className="h-5 w-5 text-secondary" aria-hidden="true" />}
        />
        <KpiCard label="Fissate" value={String(stats.pinned)} hint="sempre in evidenza" />
        <KpiCard label="Tipi" value={String(stats.kinds)} hint="categorie diverse" />
      </section>

      <Card className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            type="search"
            placeholder="Cerca nella memoria…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            leftIcon={<Search className="h-4 w-4" aria-hidden="true" />}
            aria-label="Cerca nella memoria"
          />
          <select
            aria-label="Filtra per tipo"
            value={kind}
            onChange={(event) => setKind(event.target.value)}
            className="h-11 w-full rounded-lg border border-secondary/20 bg-primary/60 px-3 text-sm text-text-primary focus:border-secondary focus:outline-none focus:ring-1 focus:ring-secondary"
          >
            <option value="all">Tutti i tipi</option>
            {(catalog.data?.memoryKinds ?? []).map((k) => (
              <option key={k.id} value={k.id}>
                {k.label}
              </option>
            ))}
          </select>
        </div>
      </Card>

      {memory.isLoading ? (
        <Card bodyClassName="p-5">
          <Skeleton lines={6} />
        </Card>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Brain className="h-5 w-5" aria-hidden="true" />}
          title="Memoria vuota"
          description="Salva qui i fatti e le preferenze che gli agenti devono ricordare."
          action={
            <Button variant="primary" onClick={() => setOpen(true)}>
              Nuova nota
            </Button>
          }
        />
      ) : (
        <Card bodyClassName="p-0">
          <ul className="divide-y divide-secondary/10">
            {items.map((entry) => (
              <li key={entry.id} className="flex flex-col gap-2 px-5 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={KIND_VARIANT[entry.kind] ?? "default"}>{kindLabel(entry.kind)}</Badge>
                  <h2 className="text-sm font-medium text-text-primary">{entry.title}</h2>
                  {entry.pinned && (
                    <Badge variant="accent" icon={<Pin className="h-3 w-3" aria-hidden="true" />}>
                      Fissata
                    </Badge>
                  )}
                </div>
                {entry.content && (
                  <p className="text-sm text-text-secondary">{entry.content}</p>
                )}
                {(entry.path || (entry.links ?? []).length > 0) && (
                  <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
                    {entry.path && (
                      <span className="inline-flex items-center gap-1">
                        <FileText className="h-3 w-3" aria-hidden="true" />
                        {entry.path}
                      </span>
                    )}
                    {(entry.links ?? []).map((link) => (
                      <span key={link} className="inline-flex items-center gap-1">
                        <Link2 className="h-3 w-3" aria-hidden="true" />
                        {link}
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-3 text-xs text-text-muted">
                  <span>Fonte: {entry.source || "—"}</span>
                  <span aria-hidden="true">·</span>
                  <span>{formatRelative(entry.created_at)}</span>
                  {entry.tags.length > 0 && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>{entry.tags.join(", ")}</span>
                    </>
                  )}
                  <div className="ml-auto flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={entry.pinned ? `Sblocca ${entry.title}` : `Fissa ${entry.title}`}
                      onClick={() => togglePin(entry.id, entry.pinned)}
                    >
                      {entry.pinned ? (
                        <PinOff className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <Pin className="h-4 w-4" aria-hidden="true" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Elimina ${entry.title}`}
                      onClick={() => handleDelete(entry.id)}
                      className="text-text-muted hover:text-error"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Nuova nota"
        description="Una voce di memoria leggibile dagli agenti nelle esecuzioni successive."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Annulla
            </Button>
            <Button
              variant="primary"
              onClick={handleCreate}
              loading={createMemory.isPending}
              disabled={!form.title.trim() || !form.content.trim()}
            >
              Salva
            </Button>
          </>
        }
      >
        <form className="flex flex-col gap-3" onSubmit={handleCreate}>
          <label className="flex flex-col gap-1 text-sm text-text-secondary">
            Tipo
            <select
              value={form.kind}
              onChange={(event) => setForm({ ...form, kind: event.target.value })}
              className="h-11 w-full rounded-lg border border-secondary/20 bg-primary/60 px-3 text-sm text-text-primary focus:border-secondary focus:outline-none focus:ring-1 focus:ring-secondary"
            >
              {(catalog.data?.memoryKinds ?? []).map((k) => (
                <option key={k.id} value={k.id}>
                  {k.label}
                </option>
              ))}
            </select>
          </label>
          <Input
            label="Titolo"
            value={form.title}
            onChange={(event) => setForm({ ...form, title: event.target.value })}
            placeholder="Es. tono di voce del brand"
          />
          <Input
            label="Percorso nel vault (opzionale)"
            value={form.path}
            onChange={(event) => setForm({ ...form, path: event.target.value })}
            placeholder="Es. Progetti/Aethersy/launch.md"
          />
          <label className="flex flex-col gap-1 text-sm text-text-secondary">
            Contenuto (markdown)
            <textarea
              value={form.content}
              onChange={(event) => setForm({ ...form, content: event.target.value })}
              rows={4}
              placeholder="Il dettaglio che gli agenti devono ricordare. Usa i collegamenti [[Titolo]] per collegare altre note."
              className="w-full rounded-lg border border-secondary/20 bg-primary/60 px-3 py-2 text-sm text-text-primary focus:border-secondary focus:outline-none focus:ring-1 focus:ring-secondary"
            />
          </label>
          <Input
            label="Fonte"
            value={form.source}
            onChange={(event) => setForm({ ...form, source: event.target.value })}
            placeholder="Es. call con il cliente, documento, evento"
          />
        </form>
      </Modal>

    </div>
  );
}
