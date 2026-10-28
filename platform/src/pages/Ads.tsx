// =============================================================================
// Annunci (brief §3.7) — rotta /ads. KPI, andamento spesa/conversioni,
// campagne advertising e creativita' con creazione campagna.
// =============================================================================

import { useMemo, useState } from "react";
import { Megaphone, MousePointerClick, Plus, Target, TrendingUp, Wallet } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { BarChart, LineChart } from "@/components/charts/Charts";
import { EmptyState, KpiCard, PageHeader, ProgressBar } from "@/components/common/PageElements";
import {
  useAdCampaigns,
  useAdCreatives,
  useAdsSeries,
  useAdsSummary,
  useCreateAdCampaign,
} from "@/lib/queries";
import type { AdObjective, AdStatus, PlatformId } from "@/lib/types";
import {
  adObjectiveLabel,
  channelLabel,
  formatCompactNumber,
  formatCurrency,
  formatNumber,
  formatPercent,
  platformLabel,
} from "@/lib/utils";

const AD_STATUS_VARIANT: Record<AdStatus, "success" | "warning" | "info" | "default"> = {
  active: "success",
  paused: "warning",
  completed: "info",
  draft: "default",
};

const OBJECTIVES: AdObjective[] = ["awareness", "traffic", "engagement", "leads", "conversions"];

const PLATFORMS: PlatformId[] = ["instagram", "facebook", "linkedin", "tiktok", "youtube"];

/** Importo con due decimali, es. CPM "8,40 €". */
function formatDecimalCurrency(value: number): string {
  return `${value.toFixed(2).replace(".", ",")} €`;
}

export default function Ads() {
  const { toast } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [campaignName, setCampaignName] = useState("");
  const [objective, setObjective] = useState<AdObjective>("conversions");
  const [platform, setPlatform] = useState<PlatformId>("instagram");

  const summary = useAdsSummary();
  const campaigns = useAdCampaigns();
  const creatives = useAdCreatives();
  const series = useAdsSeries();
  const createCampaign = useCreateAdCampaign();

  const spendPoints = useMemo(
    () =>
      (series.data ?? []).map((point) => ({
        label: point.label,
        value: point.spend,
      })),
    [series.data],
  );

  const conversionPoints = useMemo(
    () =>
      (series.data ?? []).map((point) => ({
        label: point.label,
        value: point.conversions,
      })),
    [series.data],
  );

  const creativesByCampaign = useMemo(() => {
    const map = new Map<string, number>();
    for (const creative of creatives.data ?? []) {
      map.set(creative.campaignId, (map.get(creative.campaignId) ?? 0) + 1);
    }
    return map;
  }, [creatives.data]);

  async function handleCreate() {
    try {
      await createCampaign.mutateAsync({ name: campaignName.trim() || "Nuova campagna ads" });
      toast({
        kind: "success",
        title: "Campagna creata",
        description: `${campaignName.trim() || "Nuova campagna"} salvata in bozza.`,
      });
      setModalOpen(false);
      setCampaignName("");
    } catch {
      toast({ kind: "error", title: "Creazione non riuscita" });
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Annunci"
        description="Monitora spesa, creativita' e performance delle campagne advertising."
        actions={
          <Button
            variant="primary"
            leftIcon={<Plus className="h-4 w-4" aria-hidden="true" />}
            onClick={() => setModalOpen(true)}
          >
            Nuova Campagna
          </Button>
        }
      />

      {/* KPI */}
      <section aria-label="KPI annunci" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {summary.isLoading ? (
          Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-28 rounded-xl" />
          ))
        ) : (
          <>
            <KpiCard
              label="Spesa"
              value={formatCurrency(summary.data?.spend ?? 0)}
              icon={<Wallet className="h-5 w-5 text-secondary" aria-hidden="true" />}
              delta="-4,2%"
              trend="down"
              inverse
            />
            <KpiCard
              label="Impression"
              value={formatCompactNumber(summary.data?.impressions ?? 0)}
              icon={<Megaphone className="h-5 w-5 text-secondary" aria-hidden="true" />}
              delta="+12,0%"
              trend="up"
            />
            <KpiCard
              label="CTR"
              value={formatPercent(summary.data?.ctr ?? 0, 2)}
              icon={<MousePointerClick className="h-5 w-5 text-secondary" aria-hidden="true" />}
              delta="+0,18 pt"
              trend="up"
            />
            <KpiCard
              label="ROAS"
              value={`${(summary.data?.roas ?? 0).toFixed(1).replace(".", ",")}x`}
              icon={<TrendingUp className="h-5 w-5 text-secondary" aria-hidden="true" />}
              delta="+0,4x"
              trend="up"
            />
          </>
        )}
      </section>

      {/* Andamento spesa e conversioni */}
      <div className="grid gap-6 xl:grid-cols-2">
        <Card header={<h2 className="text-base font-semibold text-text-primary">Spesa giornaliera</h2>}>
          {series.isLoading ? (
            <Skeleton className="h-52 rounded-lg" />
          ) : (
            <LineChart
              data={spendPoints}
              area
              ariaLabel="Andamento della spesa pubblicitaria giornaliera"
              valueFormatter={(value) => formatCurrency(value)}
            />
          )}
        </Card>

        <Card header={<h2 className="text-base font-semibold text-text-primary">Conversioni giornaliere</h2>}>
          {series.isLoading ? (
            <Skeleton className="h-52 rounded-lg" />
          ) : (
            <BarChart
              data={conversionPoints}
              height={200}
              ariaLabel="Conversioni pubblicitarie giornaliere"
              valueFormatter={(value) => formatNumber(value)}
            />
          )}
        </Card>
      </div>

      {/* Campagne */}
      <Card
        header={
          <>
            <h2 className="text-base font-semibold text-text-primary">Campagne</h2>
            <span className="text-xs text-text-muted">{campaigns.data?.length ?? 0} campagne</span>
          </>
        }
        bodyClassName="p-0"
      >
        {campaigns.isLoading ? (
          <div className="p-5">
            <Skeleton lines={5} />
          </div>
        ) : (campaigns.data ?? []).length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={<Megaphone className="h-5 w-5" aria-hidden="true" />}
              title="Nessuna campagna"
              description="Crea la tua prima campagna advertising."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse text-sm">
              <caption className="sr-only">Campagne advertising</caption>
              <thead>
                <tr className="border-b border-secondary/10 text-left text-xs text-text-muted">
                  <th scope="col" className="py-2 pl-5 pr-4 font-medium">Campagna</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Obiettivo</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Stato</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Budget</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Speso</th>
                  <th scope="col" className="py-2 pr-5 font-medium text-right">Conversione</th>
                </tr>
              </thead>
              <tbody>
                {(campaigns.data ?? []).map((campaign) => (
                  <tr key={campaign.id} className="border-b border-secondary/5">
                    <td className="py-3 pl-5 pr-4">
                      <span className="font-medium text-text-primary">{campaign.name}</span>
                      <span className="block text-xs text-text-muted">
                        {channelLabel(campaign.channel)} · {platformLabel(campaign.platform)} ·{" "}
                        {creativesByCampaign.get(campaign.id) ?? 0} creativita'
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-text-secondary">
                      {adObjectiveLabel(campaign.objective)}
                    </td>
                    <td className="py-3 pr-4">
                      <Badge variant={AD_STATUS_VARIANT[campaign.status]}>
                        {campaign.status}
                      </Badge>
                    </td>
                    <td className="py-3 pr-4 text-text-secondary">
                      {formatCurrency(campaign.budget)}
                    </td>
                    <td className="w-40 py-3 pr-4">
                      <ProgressBar
                        value={campaign.spent}
                        max={Math.max(campaign.budget, 1)}
                        label={`${formatCurrency(campaign.spent)} spesi`}
                      />
                    </td>
                    <td className="py-3 pr-5 text-right">
                      <span className="font-medium text-text-primary">
                        {formatNumber(campaign.conversions)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Creativita' */}
      <Card
        header={
          <>
            <h2 className="text-base font-semibold text-text-primary">Creativita'</h2>
            <span className="text-xs text-text-muted">{creatives.data?.length ?? 0} annunci</span>
          </>
        }
        bodyClassName="p-0"
      >
        {creatives.isLoading ? (
          <div className="p-5">
            <Skeleton lines={5} />
          </div>
        ) : (creatives.data ?? []).length === 0 ? (
          <div className="p-5">
            <EmptyState title="Nessuna creativita'" description="Non ci sono annunci in questa campagna." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-sm">
              <caption className="sr-only">Creativita' pubblicitarie</caption>
              <thead>
                <tr className="border-b border-secondary/10 text-left text-xs text-text-muted">
                  <th scope="col" className="py-2 pl-5 pr-4 font-medium">Nome</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Piattaforma</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Impression</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Click</th>
                  <th scope="col" className="py-2 pr-4 font-medium">CPM</th>
                  <th scope="col" className="py-2 pr-5 font-medium text-right">Conversioni</th>
                </tr>
              </thead>
              <tbody>
                {(creatives.data ?? []).map((creative) => (
                  <tr key={creative.id} className="border-b border-secondary/5">
                    <td className="py-3 pl-5 pr-4 text-text-primary">{creative.name}</td>
                    <td className="py-3 pr-4 text-text-secondary">
                      {platformLabel(creative.platform)}
                    </td>
                    <td className="py-3 pr-4 text-text-secondary">
                      {formatCompactNumber(creative.impressions)}
                    </td>
                    <td className="py-3 pr-4 text-text-secondary">{formatNumber(creative.clicks)}</td>
                    <td className="py-3 pr-4 text-text-secondary">
                      {formatDecimalCurrency(creative.cpm)}
                    </td>
                    <td className="py-3 pr-5 text-right font-medium text-text-primary">
                      {formatNumber(creative.conversions)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Modale nuova campagna */}
      <Modal
        open={modalOpen}
        onOpenChange={setModalOpen}
        title="Nuova campagna ads"
        description="Scegli piattaforma e obiettivo della campagna."
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              Annulla
            </Button>
            <Button
              variant="primary"
              loading={createCampaign.isPending}
              disabled={campaignName.trim().length < 3}
              onClick={handleCreate}
            >
              Crea campagna
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Input
            label="Nome campagna"
            placeholder="Es. Retargeting autunno"
            value={campaignName}
            onChange={(event) => setCampaignName(event.target.value)}
          />

          <fieldset>
            <legend className="mb-2 text-sm font-medium text-text-secondary">Piattaforma</legend>
            <div className="flex flex-wrap gap-2">
              {PLATFORMS.map((item) => (
                <button
                  key={item}
                  type="button"
                  aria-pressed={platform === item}
                  onClick={() => setPlatform(item)}
                  className={`rounded-full border px-3.5 py-2 text-sm transition-colors ${
                    platform === item
                      ? "border-secondary/50 bg-secondary/15 text-secondary"
                      : "border-secondary/15 text-text-secondary hover:bg-bg-hover"
                  }`}
                >
                  {platformLabel(item)}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-2 text-sm font-medium text-text-secondary">Obiettivo</legend>
            <div className="flex flex-wrap gap-2">
              {OBJECTIVES.map((item) => (
                <button
                  key={item}
                  type="button"
                  aria-pressed={objective === item}
                  onClick={() => setObjective(item)}
                  className={`rounded-full border px-3.5 py-2 text-sm transition-colors ${
                    objective === item
                      ? "border-secondary/50 bg-secondary/15 text-secondary"
                      : "border-secondary/15 text-text-secondary hover:bg-bg-hover"
                  }`}
                >
                  {adObjectiveLabel(item)}
                </button>
              ))}
            </div>
          </fieldset>

          <p className="flex items-center gap-2 text-xs text-text-muted">
            <Target className="h-3.5 w-3.5" aria-hidden="true" />
            Potrai definire budget e pubblico dopo la creazione.
          </p>
        </div>
      </Modal>
    </div>
  );
}
