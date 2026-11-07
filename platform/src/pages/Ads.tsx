// =============================================================================
// Annunci — solo dati reali dal BFF.
//
// I deliverable "annuncio" sono gli asset prodotti dalla pipeline
// (GET /api/pipeline/assets) e le esecuzioni reali (GET /api/pipeline/runs).
// Il BFF non espone un modulo advertising: campagne con budget, creativita' con
// impression/CTR/CPM, ROAS e serie storiche di spesa non esistono e quindi non
// vengono mostrate. L'unica azione disponibile e' chiedere all'orchestratore
// (POST /api/platform/chat) la produzione di un annuncio.
// =============================================================================

import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, BarChart3, Megaphone, Send, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { EmptyState, KpiCard, PageHeader } from "@/components/common/PageElements";
import { realKeys, useRuns, useSendMessage } from "@/lib/platform-queries";
import { platformApi } from "@/lib/platform-api";
import type { PipelineAsset } from "@/lib/platform-api";
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

const STAGE_LABEL: Record<string, string> = {
  brand: "Brand",
  website: "Sito web",
  content: "Contenuti",
  social: "Social",
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

/** Testo esplicito della richiesta inviata all'orchestratore. */
const GENERATE_PROMPT =
  "Crea un annuncio pubblicitario per questo tenant: definisci obiettivo, pubblico, messaggio, formato del creativo e canali consigliati, poi produci il deliverable corrispondente.";

/** Stadio dichiarato dal pipeline nell'asset (meta.stage). */
function assetStage(asset: PipelineAsset): string {
  const stage = asset.meta?.stage;
  return typeof stage === "string" ? stage : "";
}

export default function Ads() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const assets = useQuery({
    queryKey: realKeys.assets("all"),
    queryFn: () => platformApi.listAssets(),
  });
  const runs = useRuns();
  const sendMessage = useSendMessage();

  const assetRows = assets.data ?? [];
  const runRows = runs.data ?? [];

  const stats = useMemo(() => {
    const inReview = assetRows.filter((asset) => asset.status === "in_review").length;
    const accepted = assetRows.filter(
      (asset) => asset.status === "approved" || asset.status === "delivered",
    ).length;
    const latest = assetRows.reduce<string | null>((acc, asset) => {
      if (!acc || asset.created_at > acc) return asset.created_at;
      return acc;
    }, null);
    return { total: assetRows.length, inReview, accepted, latest };
  }, [assetRows]);

  async function handleGenerate() {
    try {
      const turn = await sendMessage.mutateAsync({ text: GENERATE_PROMPT });
      queryClient.invalidateQueries({ queryKey: realKeys.assets("all") });
      toast({
        kind: "success",
        title: "Richiesta inviata all'orchestratore",
        description:
          turn.action === "run_started"
            ? "La produzione e' partita: il deliverable comparira' tra gli asset."
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

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Annunci"
        description="Gli annunci sono i deliverable reali prodotti dalla pipeline, con stato e data di uscita."
        actions={
          <Button
            variant="primary"
            leftIcon={<Send className="h-4 w-4" aria-hidden="true" />}
            loading={sendMessage.isPending}
            onClick={handleGenerate}
          >
            Genera annuncio
          </Button>
        }
      />

      <section aria-label="KPI annunci" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {assets.isLoading ? (
          Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-28 rounded-xl" />
          ))
        ) : (
          <>
            <KpiCard
              label="Asset prodotti"
              value={formatNumber(stats.total)}
              icon={<Megaphone className="h-5 w-5 text-secondary" aria-hidden="true" />}
              hint="deliverable della pipeline"
            />
            <KpiCard
              label="In revisione"
              value={formatNumber(stats.inReview)}
              icon={<Sparkles className="h-5 w-5 text-secondary" aria-hidden="true" />}
              hint="da approvare"
            />
            <KpiCard
              label="Approvati"
              value={formatNumber(stats.accepted)}
              hint="approvati e consegnati"
            />
            <KpiCard
              label="Ultimo asset"
              value={stats.latest ? formatDate(stats.latest) : "—"}
              hint={stats.latest ? "data di produzione" : "nessun asset prodotto"}
            />
          </>
        )}
      </section>

      <Card
        header={
          <>
            <h2 className="text-base font-semibold text-text-primary">Annunci prodotti</h2>
            <span className="text-xs text-text-muted">{assetRows.length} asset</span>
          </>
        }
        bodyClassName="p-0"
      >
        {assets.isLoading ? (
          <div className="p-5">
            <Skeleton lines={5} />
          </div>
        ) : assetRows.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={<Megaphone className="h-5 w-5" aria-hidden="true" />}
              title="Nessun annuncio prodotto"
              description="Chiedi all'orchestratore di creare un annuncio: il deliverable comparira' qui con il suo stato reale."
              action={
                <Button
                  variant="primary"
                  leftIcon={<Send className="h-4 w-4" aria-hidden="true" />}
                  loading={sendMessage.isPending}
                  onClick={handleGenerate}
                >
                  Genera annuncio
                </Button>
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <caption className="sr-only">Annunci prodotti dalla pipeline</caption>
              <thead>
                <tr className="border-b border-secondary/10 text-left text-xs text-text-muted">
                  <th scope="col" className="py-2 pl-5 pr-4 font-medium">Annuncio</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Stadio</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Tipo</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Stato</th>
                  <th scope="col" className="py-2 pr-5 font-medium text-right">Prodotto il</th>
                </tr>
              </thead>
              <tbody>
                {assetRows.map((asset) => (
                  <tr key={asset.id} className="border-b border-secondary/5">
                    <td className="py-3 pl-5 pr-4">
                      <span className="font-medium text-text-primary">{asset.name}</span>
                      {typeof asset.meta?.title === "string" && (
                        <span className="block text-xs text-text-muted">
                          {asset.meta.title}
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-text-secondary">
                      {STAGE_LABEL[assetStage(asset)] || "—"}
                    </td>
                    <td className="py-3 pr-4 text-text-secondary">{asset.kind}</td>
                    <td className="py-3 pr-4">
                      <Badge variant={ASSET_STATUS_VARIANT[asset.status] ?? "default"}>
                        {asset.status}
                      </Badge>
                    </td>
                    <td className="py-3 pr-5 text-right text-text-secondary">
                      {formatDate(asset.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card
        header={
          <>
            <h2 className="text-base font-semibold text-text-primary">Esecuzioni della pipeline</h2>
            <span className="text-xs text-text-muted">{runRows.length} run</span>
          </>
        }
        bodyClassName="p-0"
      >
        {runs.isLoading ? (
          <div className="p-5">
            <Skeleton lines={4} />
          </div>
        ) : runRows.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={<BarChart3 className="h-5 w-5" aria-hidden="true" />}
              title="Nessuna esecuzione"
              description="Le esecuzioni reali della pipeline compariranno qui: da lì partono gli annunci."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <caption className="sr-only">Esecuzioni della pipeline</caption>
              <thead>
                <tr className="border-b border-secondary/10 text-left text-xs text-text-muted">
                  <th scope="col" className="py-2 pl-5 pr-4 font-medium">Esecuzione</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Stadio</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Stato</th>
                  <th scope="col" className="py-2 pr-5 font-medium text-right">Aggiornata</th>
                </tr>
              </thead>
              <tbody>
                {runRows.map((run) => (
                  <tr key={run.id} className="border-b border-secondary/5">
                    <td className="py-3 pl-5 pr-4 font-medium text-text-primary">{run.title}</td>
                    <td className="py-3 pr-4 text-text-secondary">
                      {STAGE_LABEL[run.stage] ?? run.stage}
                    </td>
                    <td className="py-3 pr-4">
                      <Badge variant={RUN_STATUS_VARIANT[run.status] ?? "default"}>
                        {RUN_STATUS_LABEL[run.status] ?? run.status}
                      </Badge>
                    </td>
                    <td className="py-3 pr-5 text-right text-text-secondary">
                      {formatDate(run.updated_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card header={<h2 className="text-base font-semibold text-text-primary">Dati non ancora disponibili</h2>}>
        <div className="flex flex-col gap-3">
          <p className="flex items-start gap-2 text-sm text-text-secondary">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
            Il BFF non espone un modulo advertising: per non mostrare dati inventati, campaggi e
            serie storiche restano dichiarati come non disponibili. L'unica azione reale e' chiedere
            la produzione all'orchestratore.
          </p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {[
              ["Campagne e budget", "non disponibili"],
              ["Creativita' con impression e CTR", "non disponibili"],
              ["Serie storiche di spesa", "non disponibili"],
              ["ROAS e conversioni", "non disponibili"],
            ].map(([label, value]) => (
              <li
                key={label}
                className="flex items-center justify-between gap-3 rounded-lg border border-secondary/10 bg-primary/40 px-3 py-2 text-sm"
              >
                <span className="text-text-secondary">{label}</span>
                <Badge variant="warning">{value}</Badge>
              </li>
            ))}
          </ul>
        </div>
      </Card>
    </div>
  );
}
