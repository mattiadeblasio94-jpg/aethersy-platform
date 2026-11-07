// =============================================================================
// Sito Web — solo dati reali dal BFF.
//
// Il sito e' rappresentato dai deliverable prodotti dalla pipeline
// (GET /api/pipeline/assets, stadio "website") e dalle esecuzioni reali dello
// stadio website (GET /api/pipeline/runs?stage=website). I contatti del sito
// sono i lead reali (GET /api/pipeline/leads). Il BFF non espone metriche SEO
// o di traffico: visitatori, visualizzazioni e bounce non vengono mostrati.
// Azioni reali: invio in revisione (POST /api/pipeline/assets/:id/submit),
// decisione umana (useDecideAsset) e richiesta al consulente (POST
// /api/platform/chat).
// =============================================================================

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  ExternalLink,
  Globe,
  Inbox,
  Rocket,
  Search,
  Send,
  XCircle,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { Tabs } from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/Toast";
import { EmptyState, KpiCard, PageHeader } from "@/components/common/PageElements";
import { realKeys, useDecideAsset, useLeads, useSendMessage } from "@/lib/platform-queries";
import { platformApi } from "@/lib/platform-api";
import type { LeadItem, PipelineAsset } from "@/lib/platform-api";
import { formatDate, formatNumber } from "@/lib/utils";

const ASSET_STATUS_VARIANT: Record<
  string,
  "default" | "success" | "warning" | "error" | "info"
> = {
  draft: "default",
  in_review: "warning",
  approved: "success",
  rejected: "error",
  delivered: "success",
};

const ASSET_STATUS_LABEL: Record<string, string> = {
  draft: "Bozza",
  in_review: "In revisione",
  approved: "Approvato",
  rejected: "Rifiutato",
  delivered: "Consegnato",
};

const RUN_STATUS_VARIANT: Record<
  string,
  "default" | "success" | "warning" | "error" | "info"
> = {
  draft: "default",
  in_progress: "info",
  in_review: "warning",
  approved: "success",
  delivered: "success",
  failed: "error",
};

const RUN_STATUS_LABEL: Record<string, string> = {
  draft: "Aperta",
  in_progress: "In corso",
  in_review: "In revisione",
  approved: "Approvata",
  delivered: "Consegnata",
  failed: "Fallita",
};

const LEAD_STATUS_LABEL: Record<string, string> = {
  new: "Nuovo",
  contacted: "Contattato",
  qualified: "Qualificato",
  won: "Acquisito",
  lost: "Perso",
  spam: "Spam",
};

/** Il BFF restituisce i lead con i campi del DB (snake_case). */
type LeadRow = LeadItem & { created_at?: string; updated_at?: string; phone?: string | null };

function leadCreatedAt(lead: LeadRow): string {
  return lead.created_at ?? lead.createdAt;
}

/** Testo esplicito della richiesta inviata all'orchestratore. */
const GENERATE_PROMPT =
  "Genera o aggiorna il sito web: aggiorna sitemap e wireframe, riscrivi il copy delle pagine, produci i deliverable del sito e segnala cosa serve una revisione umana.";

/** Stadio dichiarato dal pipeline nell'asset (meta.stage). */
function assetStage(asset: PipelineAsset): string {
  const stage = asset.meta?.stage;
  return typeof stage === "string" ? stage : "";
}

export default function Website() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [leadTab, setLeadTab] = useState("all");
  const [pendingAssetId, setPendingAssetId] = useState<string | null>(null);

  const assets = useQuery({
    queryKey: realKeys.assets("all"),
    queryFn: () => platformApi.listAssets(),
  });
  const websiteRuns = useQuery({
    queryKey: ["real", "runs", "stage", "website"],
    queryFn: () => platformApi.listRuns({ stage: "website" }),
  });
  const leads = useLeads();
  const decideAsset = useDecideAsset();
  const sendMessage = useSendMessage();

  const siteAssets = useMemo(
    () => (assets.data ?? []).filter((asset) => assetStage(asset) === "website"),
    [assets.data],
  );
  const runRows = websiteRuns.data ?? [];
  const leadRows = leads.data ?? [];

  const visibleLeads = useMemo(
    () =>
      leadTab === "website"
        ? leadRows.filter((lead) => lead.source === "website")
        : leadRows,
    [leadTab, leadRows],
  );

  const stats = useMemo(() => {
    const inReview = siteAssets.filter((asset) => asset.status === "in_review").length;
    const published = siteAssets.filter(
      (asset) => asset.status === "approved" || asset.status === "delivered",
    ).length;
    const siteLeads = leadRows.filter((lead) => lead.source === "website").length;
    return { inReview, published, siteLeads };
  }, [siteAssets, leadRows]);

  async function handleGenerate() {
    try {
      const turn = await sendMessage.mutateAsync({ text: GENERATE_PROMPT });
      queryClient.invalidateQueries({ queryKey: realKeys.assets("all") });
      queryClient.invalidateQueries({ queryKey: ["real", "runs", "stage", "website"] });
      toast({
        kind: "success",
        title: "Richiesta inviata al consulente",
        description:
          turn.action === "run_started"
            ? "La produzione del sito e' partita: i deliverable compariranno nella tabella."
            : turn.reply?.content,
      });
    } catch (error) {
      toast({
        kind: "error",
        title: "Invio non riuscito",
        description: error instanceof Error ? error.message : undefined,
      });
    }
  }

  async function handleSubmit(assetId: string) {
    setPendingAssetId(assetId);
    try {
      await platformApi.submitAsset(assetId);
      queryClient.invalidateQueries({ queryKey: realKeys.assets("all") });
      toast({ kind: "success", title: "Deliverable inviato in revisione" });
    } catch (error) {
      toast({
        kind: "error",
        title: "Invio non riuscito",
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setPendingAssetId(null);
    }
  }

  async function handleDecide(assetId: string, decision: "approved" | "rejected") {
    try {
      await decideAsset.mutateAsync({ assetId, decision });
      queryClient.invalidateQueries({ queryKey: realKeys.assets("all") });
      toast({
        kind: decision === "approved" ? "success" : "info",
        title: decision === "approved" ? "Deliverable approvato" : "Deliverable rifiutato",
      });
    } catch (error) {
      toast({
        kind: "error",
        title: "Decisione non registrata",
        description: error instanceof Error ? error.message : undefined,
      });
    }
  }

  const leadTabs = [
    { value: "all", label: "Tutti i lead", badge: String(leadRows.length) },
    { value: "website", label: "Dal sito", badge: String(stats.siteLeads) },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Sito Web"
        description="Pagine e deliverable prodotti dalla pipeline, con revisione e contatti reali."
        actions={
          <Button
            variant="primary"
            leftIcon={<Send className="h-4 w-4" aria-hidden="true" />}
            loading={sendMessage.isPending}
            onClick={handleGenerate}
          >
            Genera/aggiorna sito
          </Button>
        }
      />

      <section aria-label="Stato del sito" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {assets.isLoading ? (
          Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-28 rounded-xl" />
          ))
        ) : (
          <>
            <KpiCard
              label="Deliverable del sito"
              value={formatNumber(siteAssets.length)}
              icon={<Globe className="h-5 w-5 text-secondary" aria-hidden="true" />}
              hint="stadio website"
            />
            <KpiCard
              label="In revisione"
              value={formatNumber(stats.inReview)}
              hint="da approvare"
            />
            <KpiCard
              label="Approvati"
              value={formatNumber(stats.published)}
              hint="approvati e consegnati"
            />
            <KpiCard
              label="Contatti del sito"
              value={formatNumber(stats.siteLeads)}
              icon={<Inbox className="h-5 w-5 text-secondary" aria-hidden="true" />}
              hint="lead con fonte sito"
            />
          </>
        )}
      </section>

      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <Card
          header={
            <>
              <h2 className="text-base font-semibold text-text-primary">Pagine e deliverable</h2>
              <span className="text-xs text-text-muted">{siteAssets.length} elementi</span>
            </>
          }
          bodyClassName="p-0"
        >
          {assets.isLoading ? (
            <div className="p-5">
              <Skeleton lines={5} />
            </div>
          ) : siteAssets.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={<Globe className="h-5 w-5" aria-hidden="true" />}
                title="Nessun deliverable del sito"
                description="Chiedi al consulente di generare o aggiornare il sito: qui compariranno pagine, sitemap e asset prodotti."
                action={
                  <Button
                    variant="primary"
                    leftIcon={<Send className="h-4 w-4" aria-hidden="true" />}
                    loading={sendMessage.isPending}
                    onClick={handleGenerate}
                  >
                    Genera/aggiorna sito
                  </Button>
                }
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-sm">
                <caption className="sr-only">Deliverable del sito</caption>
                <thead>
                  <tr className="border-b border-secondary/10 text-left text-xs text-text-muted">
                    <th scope="col" className="py-2 pl-5 pr-4 font-medium">Deliverable</th>
                    <th scope="col" className="py-2 pr-4 font-medium">Tipo</th>
                    <th scope="col" className="py-2 pr-4 font-medium">Stato</th>
                    <th scope="col" className="py-2 pr-4 font-medium">Prodotto il</th>
                    <th scope="col" className="py-2 pr-5 font-medium text-right">Azioni</th>
                  </tr>
                </thead>
                <tbody>
                  {siteAssets.map((asset) => (
                    <tr key={asset.id} className="border-b border-secondary/5">
                      <td className="py-3 pl-5 pr-4">
                        <span className="font-medium text-text-primary">{asset.name}</span>
                        {typeof asset.meta?.title === "string" && (
                          <span className="block text-xs text-text-muted">{asset.meta.title}</span>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-text-secondary">{asset.kind}</td>
                      <td className="py-3 pr-4">
                        <Badge variant={ASSET_STATUS_VARIANT[asset.status] ?? "default"}>
                          {ASSET_STATUS_LABEL[asset.status] ?? asset.status}
                        </Badge>
                      </td>
                      <td className="py-3 pr-4 text-text-secondary">
                        {formatDate(asset.created_at)}
                      </td>
                      <td className="py-3 pr-5 text-right">
                        <div className="flex justify-end gap-2">
                          {asset.status === "draft" && (
                            <Button
                              variant="secondary"
                              size="sm"
                              loading={pendingAssetId === asset.id}
                              onClick={() => handleSubmit(asset.id)}
                            >
                              Invia in revisione
                            </Button>
                          )}
                          {asset.status === "in_review" && (
                            <>
                              <Button
                                size="sm"
                                leftIcon={<CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
                                loading={decideAsset.isPending && decideAsset.variables?.assetId === asset.id}
                                onClick={() => handleDecide(asset.id, "approved")}
                              >
                                Approva
                              </Button>
                              <Button
                                variant="secondary"
                                size="sm"
                                leftIcon={<XCircle className="h-4 w-4" aria-hidden="true" />}
                                loading={decideAsset.isPending && decideAsset.variables?.assetId === asset.id}
                                onClick={() => handleDecide(asset.id, "rejected")}
                              >
                                Rifiuta
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div className="flex flex-col gap-6">
          <Card
            header={
              <>
                <h2 className="text-base font-semibold text-text-primary">Esecuzioni del sito</h2>
                <span className="text-xs text-text-muted">{runRows.length} run</span>
              </>
            }
            bodyClassName="p-0"
          >
            {websiteRuns.isLoading ? (
              <div className="p-5">
                <Skeleton lines={4} />
              </div>
            ) : runRows.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  icon={<Rocket className="h-5 w-5" aria-hidden="true" />}
                  title="Nessuna esecuzione del sito"
                  description="Le esecuzioni reali dello stadio website compariranno qui."
                />
              </div>
            ) : (
              <ul className="divide-y divide-secondary/10">
                {runRows.map((run) => (
                  <li key={run.id} className="flex flex-col gap-2 px-5 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="min-w-0 truncate text-sm font-medium text-text-primary">
                        {run.title}
                      </span>
                      <div className="flex items-center gap-2">
                        <Badge variant={RUN_STATUS_VARIANT[run.status] ?? "default"}>
                          {RUN_STATUS_LABEL[run.status] ?? run.status}
                        </Badge>
                        <a
                          href={`/api/platform/sites/${run.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-lg border border-secondary/20 px-2.5 py-1 text-xs font-medium text-secondary transition-colors hover:bg-secondary/10"
                        >
                          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                          Apri sito
                        </a>
                      </div>
                    </div>
                    <span className="text-xs text-text-muted">
                      aggiornata {formatDate(run.updated_at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card header={<h2 className="text-base font-semibold text-text-primary">Dati SEO</h2>}>
            <div className="flex flex-col gap-3">
              <p className="flex items-start gap-2 text-sm text-text-secondary">
                <Search className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
                Il BFF non espone dati SEO o di traffico del sito: punteggio, controlli on-page,
                visitatori, visualizzazioni e frequenza di rimbalzo non sono misurati e non
                vengono mostrati.
              </p>
              <div className="flex flex-wrap gap-2">
                {["Punteggio SEO", "Controlli on-page", "Visitatori", "Frequenza di rimbalzo"].map(
                  (label) => (
                    <Badge key={label} variant="warning">
                      {label}: non disponibile
                    </Badge>
                  ),
                )}
              </div>
            </div>
          </Card>
        </div>
      </div>

      <Card
        header={
          <>
            <h2 className="text-base font-semibold text-text-primary">Contatti del sito</h2>
            <span className="text-xs text-text-muted">{visibleLeads.length} contatti</span>
          </>
        }
        bodyClassName="p-0"
      >
        <div className="border-b border-secondary/10 px-5 py-4">
          <Tabs items={leadTabs} value={leadTab} onValueChange={setLeadTab} />
        </div>

        {leads.isLoading ? (
          <div className="p-5">
            <Skeleton lines={4} />
          </div>
        ) : visibleLeads.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={<Inbox className="h-5 w-5" aria-hidden="true" />}
              title="Nessun contatto"
              description="I contatti raccolti dal form del sito arrivano via webhook e compaiono qui con nome, email e stato."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] border-collapse text-sm">
              <caption className="sr-only">Lead raccolti dal sito</caption>
              <thead>
                <tr className="border-b border-secondary/10 text-left text-xs text-text-muted">
                  <th scope="col" className="py-2 pl-5 pr-4 font-medium">Contatto</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Messaggio</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Stato</th>
                  <th scope="col" className="py-2 pr-5 font-medium text-right">Ricevuto il</th>
                </tr>
              </thead>
              <tbody>
                {visibleLeads.map((lead) => (
                  <tr key={lead.id} className="border-b border-secondary/5">
                    <td className="py-3 pl-5 pr-4">
                      <span className="font-medium text-text-primary">{lead.name ?? "—"}</span>
                      <span className="block text-xs text-text-muted">{lead.email ?? "—"}</span>
                    </td>
                    <td className="py-3 pr-4 text-text-secondary">{lead.message ?? "—"}</td>
                    <td className="py-3 pr-4">
                      <Badge variant="default">
                        {LEAD_STATUS_LABEL[lead.status] ?? lead.status}
                      </Badge>
                    </td>
                    <td className="py-3 pr-5 text-right text-text-secondary">
                      {formatDate(leadCreatedAt(lead))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
