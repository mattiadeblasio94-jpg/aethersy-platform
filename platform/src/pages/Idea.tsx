// =============================================================================
// Realizza la tua idea — dall'input concreto al risultato pubblicato.
//
// Non e' un chatbot: e' il punto in cui l'utente descrive cosa vuole
// ottenere (obiettivo, pubblico, settore, tono, riferimenti) e la piattaforma
// mette in moto i reparti reali. Ogni run creato qui e' un run vero della
// pipeline: task reali, deliverable reali, e per lo stadio web un sito
// online su /s/<slug>.
// =============================================================================

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ExternalLink, Loader2, Rocket, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { PageHeader, EmptyState } from "@/components/common/PageElements";
import { platformApi } from "@/lib/platform-api";
import type { IdeaPlan, PublishedSite } from "@/lib/platform-api";
import { HttpError } from "@/lib/http";
import { cn } from "@/lib/utils";

const TONES = ["professionale", "amichevole", "tecnico", "ispirato"];
const OUTPUTS = [
  { id: "website", label: "Sito web", hint: "pagine reali online" },
  { id: "content", label: "Contenuti", hint: "piano editoriale e articoli" },
  { id: "social", label: "Social", hint: "calendario e asset" },
  { id: "brand", label: "Brand", hint: "identita' visiva e verbale" },
];

const EXAMPLES = [
  "Sito per una pasticceria artigianale a Bologna che vende box natalizie su ordinazione",
  "Landing page per un corso di formazione aziendale sulla sicurezza informatica",
  "Identita' e sito per uno studio di architettura che progetta ristrutturazioni di interni",
];

export default function Idea() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [objective, setObjective] = useState("");
  const [brand, setBrand] = useState("");
  const [audience, setAudience] = useState("");
  const [sector, setSector] = useState("");
  const [tone, setTone] = useState(TONES[0]);
  const [location, setLocation] = useState("");
  const [domain, setDomain] = useState("");
  const [references, setReferences] = useState("");
  const [outputs, setOutputs] = useState<string[]>(["website"]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<IdeaPlan | null>(null);

  const runIds = useMemo(() => (plan?.runs ?? []).map((run) => run.runId), [plan]);

  // Segue i run reali: quando finiscono, il sito appare tra i siti pubblicati.
  const runs = useQuery({
    queryKey: ["real", "idea", "runs", runIds.join(",")],
    queryFn: async () => {
      const details = await Promise.all(runIds.map((id) => platformApi.getRun(id)));
      return details.map((detail) => detail);
    },
    enabled: runIds.length > 0,
    refetchInterval: (query) => {
      const items = query.state.data ?? [];
      const active = items.some(
        (item) => item.run.status === "draft" || item.run.status === "in_progress",
      );
      return active ? 4000 : false;
    },
  });

  const sites = useQuery({
    queryKey: ["real", "sites", "published"],
    queryFn: () => platformApi.listPublishedSites(),
  });

  const finished = (runs.data ?? []).every(
    (item) => item.run.status !== "draft" && item.run.status !== "in_progress",
  );
  const activeRun = (runs.data ?? []).find(
    (item) => item.run.status === "draft" || item.run.status === "in_progress",
  );
  const websiteSite = (sites.data?.sites ?? []).find(
    (site) => runIds.includes(site.runId),
  ) as PublishedSite | undefined;

  useEffect(() => {
    if (!finished || runIds.length === 0) return;
    queryClient.invalidateQueries({ queryKey: ["real", "sites", "published"] });
    queryClient.invalidateQueries({ queryKey: ["real", "assets", "all"] });
  }, [finished, runIds.length, queryClient]);

  function toggleOutput(id: string) {
    setOutputs((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (objective.trim().length < 10) {
      setError("Descrivi in almeno 10 caratteri cosa vuoi realizzare.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await platformApi.createIdea({
        objective: objective.trim(),
        brand: brand.trim() || undefined,
        audience: audience.trim() || undefined,
        sector: sector.trim() || undefined,
        tone,
        location: location.trim() || undefined,
        domain: domain.trim() || undefined,
        references: references
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean),
        outputs,
      });
      setPlan(result);
      toast({
        kind: "success",
        title: "Realizzazione avviata",
        description: `${result.runs.length} reparti al lavoro: il sito sara' online a breve.`,
      });
    } catch (err) {
      const message =
        err instanceof HttpError ? err.message : "Avvio non riuscito. Riprova.";
      setError(message);
      toast({ kind: "error", title: "Avvio non riuscito", description: message });
    } finally {
      setBusy(false);
    }
  }

  const field =
    "w-full rounded-xl border border-border-default bg-surface-raised px-4 py-3 text-sm text-text-primary outline-none transition-colors placeholder:text-text-tertiary focus:border-accent";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Realizza la tua idea"
        description="Descrivi il risultato che vuoi: la piattaforma crea i reparti necessari, produce i deliverable e pubblica il sito."
      />

      <Card header={<h2 className="text-base font-semibold text-text-primary">Il progetto</h2>}>
        <form onSubmit={submit} className="space-y-4">
          <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
            Cosa vuoi realizzare? (obbligatorio)
            <textarea
              value={objective}
              onChange={(event) => setObjective(event.target.value)}
              rows={3}
              placeholder="Es. sito per una pasticceria artigianale a Bologna che vende box natalizie su ordinazione"
              className={field}
            />
          </label>

          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => setObjective(example)}
                className="rounded-full border border-border-default px-3 py-1 text-xs text-text-secondary transition-colors hover:border-accent/50 hover:text-text-primary"
              >
                {example.slice(0, 46)}...
              </button>
            ))}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
              Brand / azienda
              <input
                value={brand}
                onChange={(event) => setBrand(event.target.value)}
                placeholder="Es. DolceFatto"
                className={field}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
              Pubblico
              <input
                value={audience}
                onChange={(event) => setAudience(event.target.value)}
                placeholder="Es. famiglie e aziende che regalano"
                className={field}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
              Settore
              <input
                value={sector}
                onChange={(event) => setSector(event.target.value)}
                placeholder="Es. pasticceria artigianale"
                className={field}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
              Citta' / paese
              <input
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                placeholder="Es. Bologna, Italia"
                className={field}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
              Dominio desiderato
              <input
                value={domain}
                onChange={(event) => setDomain(event.target.value)}
                placeholder="Es. dolcefatto.it"
                className={field}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
              Tono di voce
              <select
                value={tone}
                onChange={(event) => setTone(event.target.value)}
                className={field}
              >
                {TONES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
            Riferimenti (uno per riga)
            <textarea
              value={references}
              onChange={(event) => setReferences(event.target.value)}
              rows={2}
              placeholder={"https://sito-di-esempio.it\nMateriale di riferimento, concorrenti, listino prezzi"}
              className={field}
            />
          </label>

          <div className="flex flex-col gap-2">
            <span className="text-sm text-text-secondary">Cosa deve produrre</span>
            <div className="flex flex-wrap gap-2">
              {OUTPUTS.map((output) => {
                const active = outputs.includes(output.id);
                return (
                  <button
                    key={output.id}
                    type="button"
                    onClick={() => toggleOutput(output.id)}
                    className={cn(
                      "rounded-xl border px-3 py-2 text-left text-xs transition-colors",
                      active
                        ? "border-accent bg-accent/10 text-text-primary"
                        : "border-border-default text-text-secondary hover:border-accent/50",
                    )}
                  >
                    <span className="block font-medium">{output.label}</span>
                    <span className="block text-text-tertiary">{output.hint}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {error && (
            <p className="flex items-start gap-2 text-sm text-danger" role="alert">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {error}
            </p>
          )}

          <Button type="submit" disabled={busy} leftIcon={<Rocket className="h-4 w-4" />}>
            {busy ? "Avvio in corso" : "Realizza l'idea"}
          </Button>
        </form>
      </Card>

      {plan && (
        <Card
          header={
            <>
              <h2 className="text-base font-semibold text-text-primary">Reparti al lavoro</h2>
              <span className="text-xs text-text-muted">{plan.title}</span>
            </>
          }
          bodyClassName="p-0"
        >
          <ul className="divide-y divide-border-default/60">
            {(runs.data ?? []).map((item) => (
              <li key={item.run.id} className="flex flex-col gap-2 px-5 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-text-primary">
                    {plan.runs.find((run) => run.runId === item.run.id)?.title ?? item.run.stage}
                  </span>
                  <Badge
                    variant={
                      item.run.status === "failed"
                        ? "error"
                        : item.run.status === "delivered" || item.run.status === "approved"
                          ? "success"
                          : item.run.status === "in_progress"
                            ? "info"
                            : "default"
                    }
                  >
                    {item.run.status}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-2 text-xs text-text-muted">
                  {item.tasks.map((task) => (
                    <span
                      key={task.id}
                      className={cn(
                        "rounded-full border border-border-default px-2 py-0.5",
                        task.status === "done" && "border-success/40 text-success",
                        task.status === "failed" && "border-danger/40 text-danger",
                      )}
                    >
                      {task.droid}: {task.title}
                    </span>
                  ))}
                </div>
                {item.assets.length > 0 && (
                  <span className="text-xs text-text-muted">
                    {item.assets.length} deliverable prodotti
                  </span>
                )}
              </li>
            ))}
            {runs.isLoading && (
              <li className="px-5 py-3">
                <Skeleton lines={2} />
              </li>
            )}
          </ul>

          <div className="border-t border-border-default/60 px-5 py-4">
            {activeRun ? (
              <p className="flex items-center gap-2 text-sm text-text-secondary">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                I reparti stanno lavorando: ricerca, contenuti, immagini e sito.
              </p>
            ) : websiteSite ? (
              <div className="flex flex-col gap-2">
                <p className="flex items-center gap-2 text-sm text-success">
                  <Sparkles className="h-4 w-4" aria-hidden="true" />
                  Sito online: {websiteSite.pageCount} pagine pubblicate.
                </p>
                <a
                  href={websiteSite.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline"
                >
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  {websiteSite.url}
                </a>
              </div>
            ) : (
              <p className="text-sm text-text-secondary">
                I reparti hanno finito. Apri la pagina "Sito Web" per pubblicare il
                risultato o rivedere i deliverable.
              </p>
            )}
          </div>
        </Card>
      )}

      {!plan && (
        <EmptyState
          icon={<Rocket className="h-5 w-5" aria-hidden="true" />}
          title="Nessuna idea in corso"
          description="Compila il modulo qui sopra: la piattaforma crea i reparti, cerca sul web reale e produce il sito online."
        />
      )}
    </div>
  );
}
