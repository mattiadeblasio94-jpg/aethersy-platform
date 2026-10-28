// =============================================================================
// Outreach (brief §3.5) — rotta /outreach. KPI, campagne, sequenze di follow-up
// e tabella lead/prospect con azioni e creazione campagna.
// =============================================================================

import { useMemo, useState } from "react";
import { Mail, MessageSquare, Plus, Send, Target, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { EmptyState, KpiCard, PageHeader, ProgressBar } from "@/components/common/PageElements";
import {
  useCreateOutreachCampaign,
  useLeads,
  useOutreachCampaigns,
  useOutreachSequences,
  useOutreachSummary,
} from "@/lib/queries";
import type { LeadStatus, OutreachChannel, OutreachStatus } from "@/lib/types";
import {
  formatDateTime,
  formatNumber,
  formatPercent,
  formatRelative,
  leadStatusLabel,
  outreachChannelLabel,
  outreachStatusLabel,
} from "@/lib/utils";

const OUTREACH_STATUS_VARIANT: Record<OutreachStatus, "success" | "warning" | "default" | "info"> = {
  active: "success",
  paused: "warning",
  completed: "info",
  draft: "default",
};

const LEAD_STATUS_VARIANT: Record<LeadStatus, "default" | "info" | "success" | "warning" | "error" | "accent"> = {
  new: "default",
  contacted: "info",
  replied: "accent",
  interested: "info",
  meeting: "warning",
  won: "success",
  lost: "error",
};

const CHANNEL_ICON: Record<OutreachChannel, typeof Mail> = {
  email: Mail,
  linkedin: MessageSquare,
  twitter: MessageSquare,
  phone: Send,
};

export default function Outreach() {
  const { toast } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [campaignName, setCampaignName] = useState("");
  const [channel, setChannel] = useState<OutreachChannel>("linkedin");
  const [target, setTarget] = useState("");
  const [template, setTemplate] = useState("");

  const summary = useOutreachSummary();
  const campaigns = useOutreachCampaigns();
  const sequences = useOutreachSequences();
  const leads = useLeads();
  const createCampaign = useCreateOutreachCampaign();

  const sequencesByCampaign = useMemo(() => {
    const map = new Map<string, typeof sequences.data>();
    for (const step of sequences.data ?? []) {
      const list = map.get(step.campaignId) ?? [];
      list.push(step);
      map.set(step.campaignId, list);
    }
    return map;
  }, [sequences.data]);

  function resetForm() {
    setCampaignName("");
    setChannel("linkedin");
    setTarget("");
    setTemplate("");
  }

  async function handleCreate() {
    try {
      await createCampaign.mutateAsync({ name: campaignName.trim() || "Nuova campagna" });
      toast({
        kind: "success",
        title: "Campagna creata",
        description: `${campaignName.trim() || "Nuova campagna"} e' in bozza.`,
      });
      setModalOpen(false);
      resetForm();
    } catch {
      toast({ kind: "error", title: "Creazione non riuscita" });
    }
  }

  function handleLeadAction(name: string, action: string) {
    toast({ kind: "info", title: action, description: `Azione registrata per ${name}.` });
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Outreach"
        description="Sequenze di contatto, prospect qualificati e automazioni di follow-up."
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
      <section aria-label="KPI outreach" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {summary.isLoading ? (
          Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-28 rounded-xl" />
          ))
        ) : (
          <>
            <KpiCard
              label="Messaggi inviati"
              value={formatNumber(summary.data?.messagesSent ?? 0)}
              icon={<Send className="h-5 w-5 text-secondary" aria-hidden="true" />}
              delta="+124 questa settimana"
              trend="up"
            />
            <KpiCard
              label="Tasso di risposta"
              value={formatPercent(summary.data?.responseRate ?? 0)}
              icon={<MessageSquare className="h-5 w-5 text-secondary" aria-hidden="true" />}
              delta="+2,1 pt"
              trend="up"
            />
            <KpiCard
              label="Riunioni fissate"
              value={formatNumber(summary.data?.meetings ?? 0)}
              icon={<Target className="h-5 w-5 text-secondary" aria-hidden="true" />}
              delta="+5"
              trend="up"
            />
            <KpiCard
              label="Conversione"
              value={formatPercent(summary.data?.conversionRate ?? 0)}
              icon={<TrendingUp className="h-5 w-5 text-secondary" aria-hidden="true" />}
              delta="-0,4 pt"
              trend="down"
            />
          </>
        )}
      </section>

      {/* Campagne */}
      <section aria-label="Campagne di outreach" className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-semibold text-text-primary">Campagne</h2>
        {campaigns.isLoading ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {Array.from({ length: 2 }).map((_, index) => (
              <Skeleton key={index} className="h-56 rounded-xl" />
            ))}
          </div>
        ) : (campaigns.data ?? []).length === 0 ? (
          <EmptyState
            icon={<Send className="h-5 w-5" aria-hidden="true" />}
            title="Nessuna campagna"
            description="Crea la tua prima campagna di outreach."
          />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {(campaigns.data ?? []).map((campaign) => {
              const ChannelIcon = CHANNEL_ICON[campaign.channel];
              const steps = sequencesByCampaign.get(campaign.id) ?? [];
              return (
                <Card key={campaign.id} className="flex flex-col gap-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary/15">
                        <ChannelIcon className="h-5 w-5 text-secondary" aria-hidden="true" />
                      </span>
                      <div>
                        <h3 className="text-base font-semibold text-text-primary">{campaign.name}</h3>
                        <p className="text-xs text-text-muted">
                          {outreachChannelLabel(campaign.channel)} · iniziata {formatRelative(campaign.startedAt)}
                        </p>
                      </div>
                    </div>
                    <Badge variant={OUTREACH_STATUS_VARIANT[campaign.status]}>
                      {outreachStatusLabel(campaign.status)}
                    </Badge>
                  </div>

                  <dl className="grid grid-cols-3 gap-3 text-sm">
                    <div className="rounded-lg bg-primary/40 px-3 py-2">
                      <dt className="text-xs text-text-muted">Inviati</dt>
                      <dd className="font-semibold text-text-primary">{formatNumber(campaign.sent)}</dd>
                    </div>
                    <div className="rounded-lg bg-primary/40 px-3 py-2">
                      <dt className="text-xs text-text-muted">Risposte</dt>
                      <dd className="font-semibold text-text-primary">{formatNumber(campaign.replies)}</dd>
                    </div>
                    <div className="rounded-lg bg-primary/40 px-3 py-2">
                      <dt className="text-xs text-text-muted">Conversione</dt>
                      <dd className="font-semibold text-text-primary">{formatPercent(campaign.conversionRate)}</dd>
                    </div>
                  </dl>

                  <ProgressBar
                    value={campaign.replies}
                    max={Math.max(campaign.sent, 1)}
                    label={`Risposte su inviati`}
                  />

                  {steps.length > 0 && (
                    <div>
                      <p className="mb-2 text-xs font-medium text-text-secondary">
                        Sequenza di follow-up
                      </p>
                      <ol className="flex flex-col gap-2">
                        {steps
                          .sort((a, b) => a.order - b.order)
                          .map((step) => (
                            <li key={step.id} className="flex items-center gap-3 text-sm">
                              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-bg-hover text-xs font-semibold text-text-secondary">
                                {step.order}
                              </span>
                              <span className="min-w-0 flex-1 truncate text-text-primary">
                                {step.subject}
                              </span>
                              <span className="text-xs text-text-muted">+{step.dayOffset}g</span>
                              <span className="text-xs text-secondary">
                                {formatPercent(step.openRate, 0)}
                              </span>
                            </li>
                          ))}
                      </ol>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* Lead */}
      <Card
        header={
          <>
            <h2 className="text-base font-semibold text-text-primary">Lead e prospect</h2>
            <span className="text-xs text-text-muted">{leads.data?.length ?? 0} contatti</span>
          </>
        }
        bodyClassName="p-0"
      >
        {leads.isLoading ? (
          <div className="p-5">
            <Skeleton lines={6} />
          </div>
        ) : (leads.data ?? []).length === 0 ? (
          <div className="p-5">
            <EmptyState title="Nessun lead" description="I prospect appariranno qui." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-sm">
              <caption className="sr-only">Elenco lead e prospect</caption>
              <thead>
                <tr className="border-b border-secondary/10 text-left text-xs text-text-muted">
                  <th scope="col" className="py-2 pl-5 pr-4 font-medium">Nome</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Azienda</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Canale</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Stato</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Ultimo contatto</th>
                  <th scope="col" className="py-2 pr-5 font-medium text-right">Azioni</th>
                </tr>
              </thead>
              <tbody>
                {(leads.data ?? []).map((lead) => (
                  <tr key={lead.id} className="border-b border-secondary/5">
                    <td className="py-3 pl-5 pr-4">
                      <span className="font-medium text-text-primary">{lead.name}</span>
                      <span className="block text-xs text-text-muted">{lead.email}</span>
                    </td>
                    <td className="py-3 pr-4 text-text-secondary">{lead.company}</td>
                    <td className="py-3 pr-4 text-text-secondary">
                      {outreachChannelLabel(lead.channel)}
                    </td>
                    <td className="py-3 pr-4">
                      <Badge variant={LEAD_STATUS_VARIANT[lead.status]}>
                        {leadStatusLabel(lead.status)}
                      </Badge>
                    </td>
                    <td className="py-3 pr-4 text-text-muted">
                      {lead.lastContact ? formatDateTime(lead.lastContact) : "—"}
                    </td>
                    <td className="py-3 pr-5 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleLeadAction(lead.name, "Follow-up inviato")}
                      >
                        Follow-up
                      </Button>
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
        title="Nuova campagna"
        description="Definisci canale, target e messaggio di apertura."
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
            placeholder="Es. Agenzie digitali — Nord Italia"
            value={campaignName}
            onChange={(event) => setCampaignName(event.target.value)}
          />

          <fieldset>
            <legend className="mb-2 text-sm font-medium text-text-secondary">Canale</legend>
            <div className="flex flex-wrap gap-2">
              {(["linkedin", "email", "twitter", "phone"] as OutreachChannel[]).map((item) => (
                <button
                  key={item}
                  type="button"
                  aria-pressed={channel === item}
                  onClick={() => setChannel(item)}
                  className={`rounded-full border px-3.5 py-2 text-sm transition-colors ${
                    channel === item
                      ? "border-secondary/50 bg-secondary/15 text-secondary"
                      : "border-secondary/15 text-text-secondary hover:bg-bg-hover"
                  }`}
                >
                  {outreachChannelLabel(item)}
                </button>
              ))}
            </div>
          </fieldset>

          <Input
            label="Target"
            placeholder="Es. Agenzie con 10-50 dipendenti"
            value={target}
            onChange={(event) => setTarget(event.target.value)}
          />

          <div className="flex flex-col gap-1.5">
            <label htmlFor="outreach-template" className="text-sm font-medium text-text-secondary">
              Messaggio template
            </label>
            <textarea
              id="outreach-template"
              rows={3}
              value={template}
              onChange={(event) => setTemplate(event.target.value)}
              placeholder="Ciao {{nome}}, ho notato che…"
              className="w-full rounded-lg border border-secondary/20 bg-primary/60 px-3.5 py-2.5 text-base text-text-primary placeholder:text-text-muted focus:border-secondary focus:outline-none focus:ring-1 focus:ring-secondary"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
