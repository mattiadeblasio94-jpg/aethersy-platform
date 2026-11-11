// =============================================================================
// Specialisti — i 12 reparti operativi di Aethersy, avviabili con un comando.
//
// Ogni scheda descrive cosa produce davvero lo specialista (ricerca con fonti,
// immagini, copy, sito, piano SEO). "Avvia" apre un run mirato: lo
// specialista lavora, i deliverable finiscono in revisione e il run resta
// visibile in Opportunita'. Nessuna simulazione: se la ricerca web non
// risponde, l'errore viene detto.
// =============================================================================

import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Bot, Loader2, Play, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import { EmptyState, PageHeader } from "@/components/common/PageElements";
import { platformApi } from "@/lib/platform-api";
import type { DroidAction } from "@/lib/platform-api";
import { HttpError } from "@/lib/http";
import { cn } from "@/lib/utils";

const STAGES: { value: string; label: string }[] = [
  { value: "brand", label: "Brand" },
  { value: "website", label: "Sito web" },
  { value: "content", label: "Contenuti" },
  { value: "social", label: "Social" },
];

export default function Specialists() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [openDroid, setOpenDroid] = useState<string | null>(null);
  const [instruction, setInstruction] = useState("");
  const [stage, setStage] = useState("");

  const actions = useQuery({
    queryKey: ["real", "droid-actions"],
    queryFn: () => platformApi.getDroidActions(),
  });

  const run = useMutation({
    mutationFn: (input: { droid: string; instruction: string; stage?: string }) =>
      platformApi.runDroid(input.droid, input.instruction, input.stage),
    onSuccess: (result) => {
      toast({
        kind: result.failed ? "error" : "success",
        title: result.failed ? "Specialista interrotto" : "Specialista al lavoro completato",
        description: result.message,
      });
      if (!result.failed) {
        setOpenDroid(null);
        setInstruction("");
      }
    },
    onError: (err) => {
      const message = err instanceof HttpError ? err.message : "Avvio non riuscito.";
      toast({ kind: "error", title: "Avvio non riuscito", description: message });
    },
  });

  function submit(event: FormEvent, droid: string) {
    event.preventDefault();
    if (instruction.trim().length < 5) {
      toast({ kind: "error", title: "Istruzione troppo breve" });
      return;
    }
    run.mutate({ droid, instruction: instruction.trim(), stage: stage || undefined });
  }

  const list: DroidAction[] = actions.data?.actions ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Specialisti"
        description="Avvia un reparto operativo e ottieni lavoro vero: ricerca con fonti, immagini, copy, siti e piani."
      />

      {actions.isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Card key={index} className="h-40 animate-pulse bg-surface-raised" />
          ))}
        </div>
      )}

      {actions.isError && (
        <EmptyState
          icon={<Bot className="h-5 w-5" aria-hidden="true" />}
          title="Specialisti non disponibili"
          description="Il BFF non ha risposto: riprova tra poco."
          action={
            <Button variant="secondary" onClick={() => actions.refetch()}>
              Riprova
            </Button>
          }
        />
      )}

      {!actions.isLoading && list.length === 0 && !actions.isError && (
        <EmptyState
          icon={<Bot className="h-5 w-5" aria-hidden="true" />}
          title="Nessuno specialista disponibile"
          description="Il roster degli agenti non e' stato caricato dal BFF."
        />
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {list.map((action) => {
          const isOpen = openDroid === action.droid;
          const busy = run.isPending && run.variables?.droid === action.droid;
          return (
            <Card key={action.droid} className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-display text-base font-semibold text-text-primary">
                    {action.name}
                  </h3>
                  <p className="text-xs text-text-tertiary">{action.role}</p>
                </div>
                <Badge variant="default">{action.department}</Badge>
              </div>

              <p className="text-sm text-text-secondary">{action.capability}</p>

              <p className="text-xs text-text-tertiary">Produce: {action.does}</p>

              {!isOpen ? (
                <Button
                  variant="secondary"
                  leftIcon={<Play className="h-4 w-4" aria-hidden="true" />}
                  onClick={() => {
                    setOpenDroid(action.droid);
                    setStage(action.stage);
                    setInstruction("");
                  }}
                  className="mt-auto"
                >
                  Avvia
                </Button>
              ) : (
                <form onSubmit={(event) => submit(event, action.droid)} className="mt-auto space-y-3">
                  <textarea
                    value={instruction}
                    onChange={(event) => setInstruction(event.target.value)}
                    rows={3}
                    autoFocus
                    placeholder="Es. analizza i concorrenti italiani del settore e scrivi il report con le fonti"
                    className="w-full resize-y rounded-xl border border-border-default bg-surface-raised px-3 py-2 text-sm text-text-primary outline-none transition-colors placeholder:text-text-tertiary focus:border-accent"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={stage}
                      onChange={(event) => setStage(event.target.value)}
                      className="rounded-lg border border-border-default bg-surface-raised px-2 py-1.5 text-xs text-text-primary outline-none focus:border-accent"
                    >
                      {STAGES.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                    <Button type="submit" disabled={busy} variant="primary" className="ml-auto">
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                      {busy ? "In esecuzione" : "Esegui"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setOpenDroid(null)}
                      className={cn("text-xs")}
                    >
                      Annulla
                    </Button>
                  </div>
                </form>
              )}
            </Card>
          );
        })}
      </div>

      {run.isSuccess && !run.isPending && (
        <Card className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-text-secondary">
            {run.data.message} Crediti consumati: {run.data.credits}.
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => navigate("/opportunities")}>
              Vedi opportunita'
            </Button>
            <Button variant="primary" onClick={() => navigate("/library")}>
              Apri libreria
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
