// =============================================================================
// Outreach — solo dati reali dal BFF.
//
// Il funnel dei lead e' l'unica fonte reale disponibile: GET
// /api/pipeline/leads (elenco + conteggi per stato) e PATCH
// /api/pipeline/leads/:id per l'avanzamento nel funnel. Le transizioni
// ammesse sono quelle del BFF (new -> contacted/qualified/won/lost/spam,
// won/lost/spam terminali). Campagne, sequenze e automazioni di follow-up
// non esistono come modulo nel BFF: non vengono mostrate.
// =============================================================================

import { useMemo, useState } from "react";
import { Inbox, Mail, MessageSquare, Send, Target, Users } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { EmptyState, KpiCard, PageHeader } from "@/components/common/PageElements";
import {
  useLeadCounts,
  useLeads,
  useOpportunities,
  useSendMessage,
  useUpdateLead,
} from "@/lib/platform-queries";
import type { LeadItem } from "@/lib/platform-api";
import { formatDate, formatNumber } from "@/lib/utils";

/** Il BFF restituisce i lead con i campi del DB (snake_case). */
type LeadRow = LeadItem & { created_at?: string; updated_at?: string; phone?: string | null };

type LeadStatus =
  | "new"
  | "contacted"
  | "qualified"
  | "won"
  | "lost"
  | "spam";

const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  new: "Nuovo",
  contacted: "Contattato",
  qualified: "Qualificato",
  won: "Acquisito",
  lost: "Perso",
  spam: "Spam",
};

const LEAD_STATUS_VARIANT: Record<
  LeadStatus,
  "default" | "info" | "success" | "warning" | "error" | "accent"
> = {
  new: "default",
  contacted: "info",
  qualified: "accent",
  won: "success",
  lost: "error",
  spam: "warning",
};

/** Transizioni ammesse dal BFF (stessa macchina a stati del server). */
const LEAD_TRANSITIONS: Record<LeadStatus, LeadStatus[]> = {
  new: ["contacted", "qualified", "won", "lost", "spam"],
  contacted: ["qualified", "won", "lost", "spam"],
  qualified: ["won", "lost", "spam"],
  won: [],
  lost: [],
  spam: [],
};

const STATUS_ORDER: LeadStatus[] = [
  "new",
  "contacted",
  "qualified",
  "won",
  "lost",
  "spam",
];

const RUN_STATUS_LABEL: Record<string, string> = {
  draft: "Aperta",
  in_progress: "In corso",
  in_review: "In revisione",
  approved: "Approvata",
  delivered: "Consegnata",
  failed: "Fallita",
};

const STAGE_LABEL: Record<string, string> = {
  brand: "Brand",
  website: "Sito / Web",
  content: "Contenuti",
  social: "Social media",
};

/** Testo esplicito della richiesta inviata all'orchestratore. */
const OUTREACH_PROMPT =
  "Avvia il lavoro di outreach: prendi i lead in stato 'new', proponi il primo messaggio di contatto per ciascuno e dimmi cosa serve per portarli avanti nel funnel.";

function isLeadStatus(value: string): value is LeadStatus {
  return (STATUS_ORDER as string[]).includes(value);
}

function leadCreatedAt(lead: LeadRow): string {
  return lead.created_at ?? lead.createdAt;
}

export default function Outreach() {
  const { toast } = useToast();
  const [pendingLeadId, setPendingLeadId] = useState<string | null>(null);

  const leads = useLeads();
  const counts = useLeadCounts();
  const opportunities = useOpportunities();
  const updateLead = useUpdateLead();
  const sendMessage = useSendMessage();

  const leadRows: LeadRow[] = leads.data ?? [];
  const countMap = counts.data ?? {};

  const funnel = useMemo(
    () =>
      STATUS_ORDER.map((status) => ({
        status,
        label: LEAD_STATUS_LABEL[status],
        count: countMap[status] ?? 0,
      })),
    [countMap],
  );

  const totals = useMemo(() => {
    const total = leadRows.length;
    const active = leadRows.filter((lead) => lead.status === "new" || lead.status === "contacted").length;
    const qualified = leadRows.filter((lead) => lead.status === "qualified").length;
    const won = leadRows.filter((lead) => lead.status === "won").length;
    return { total, active, qualified, won };
  }, [leadRows]);

  async function handleStatusChange(lead: LeadRow, status: LeadStatus) {
    setPendingLeadId(lead.id);
    try {
      await updateLead.mutateAsync({ id: lead.id, body: { status } });
      toast({
        kind: "success",
        title: "Lead aggiornato",
        description: `${lead.name ?? lead.email ?? "Lead"} ora e' in stato "${LEAD_STATUS_LABEL[status]}".`,
      });
    } catch (error) {
      toast({
        kind: "error",
        title: "Transizione non riuscita",
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setPendingLeadId(null);
    }
  }

  async function handleStartOutreach() {
    try {
      const turn = await sendMessage.mutateAsync({ text: OUTREACH_PROMPT });
      toast({
        kind: "success",
        title: "Richiesta inviata al consulente",
        description:
          turn.action === "run_started"
            ? "Il lavoro di outreach e' partito."
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

  const runs = opportunities.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Outreach"
        description="Lead reali del funnel, stato di qualificazione e lavoro di contatto in corso."
        actions={
          <Button
            variant="primary"
            leftIcon={<Send className="h-4 w-4" aria-hidden="true" />}
            loading={sendMessage.isPending}
            onClick={handleStartOutreach}
          >
            Avvia outreach
          </Button>
        }
      />

      <section aria-label="KPI outreach" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {leads.isLoading ? (
          Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-28 rounded-xl" />
          ))
        ) : (
          <>
            <KpiCard
              label="Lead totali"
              value={formatNumber(totals.total)}
              icon={<Users className="h-5 w-5 text-secondary" aria-hidden="true" />}
              hint="contatti registrati"
            />
            <KpiCard
              label="Da contattare"
              value={formatNumber(totals.active)}
              icon={<Inbox className="h-5 w-5 text-secondary" aria-hidden="true" />}
              hint="nuovi e contattati"
            />
            <KpiCard
              label="Qualificati"
              value={formatNumber(totals.qualified)}
              icon={<Target className="h-5 w-5 text-secondary" aria-hidden="true" />}
              hint="pronti per la trattativa"
            />
            <KpiCard
              label="Acquisiti"
              value={formatNumber(totals.won)}
              icon={<Mail className="h-5 w-5 text-secondary" aria-hidden="true" />}
              hint="chiusi come won"
            />
          </>
        )}
      </section>

      <div className="grid gap-6 xl:grid-cols-[1fr_2fr]">
        <Card
          header={
            <>
              <h2 className="text-base font-semibold text-text-primary">Funnel dei lead</h2>
              <span className="text-xs text-text-muted">conteggi reali</span>
            </>
          }
        >
          {counts.isLoading ? (
            <Skeleton lines={6} />
          ) : (
            <ul className="flex flex-col gap-2">
              {funnel.map((row) => (
                <li
                  key={row.status}
                  className="flex items-center justify-between gap-3 rounded-lg border border-secondary/10 px-3 py-2 text-sm"
                >
                  <span className="text-text-secondary">{row.label}</span>
                  <Badge variant={LEAD_STATUS_VARIANT[row.status]}>
                    {formatNumber(row.count)}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          header={
            <>
              <h2 className="text-base font-semibold text-text-primary">Esecuzioni della pipeline</h2>
              <span className="text-xs text-text-muted">{runs.length} run</span>
            </>
          }
          bodyClassName="p-0"
        >
          {opportunities.isLoading ? (
            <div className="p-5">
              <Skeleton lines={5} />
            </div>
          ) : runs.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={<MessageSquare className="h-5 w-5" aria-hidden="true" />}
                title="Nessuna esecuzione attiva"
                description="Le esecuzioni reali della pipeline (brand, sito, contenuti, social) compariranno qui."
              />
            </div>
          ) : (
            <ul className="divide-y divide-secondary/10">
              {runs.map((run) => (
                <li key={run.id} className="flex flex-col gap-1 px-5 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate text-sm font-medium text-text-primary">
                      {run.title}
                    </span>
                    <Badge
                      variant={
                        run.status === "failed"
                          ? "error"
                          : run.status === "delivered" || run.status === "approved"
                            ? "success"
                            : run.status === "in_review"
                              ? "warning"
                              : "info"
                      }
                    >
                      {RUN_STATUS_LABEL[run.status] ?? run.status}
                    </Badge>
                  </div>
                  <span className="text-xs text-text-muted">
                    {STAGE_LABEL[run.stage] ?? run.stage} · aggiornata {formatDate(run.updated_at)}
                    {run.opportunity?.needsHuman ? " · richiede una decisione" : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card
        header={
          <>
            <h2 className="text-base font-semibold text-text-primary">Lead e prospect</h2>
            <span className="text-xs text-text-muted">{leadRows.length} contatti</span>
          </>
        }
        bodyClassName="p-0"
      >
        {leads.isLoading ? (
          <div className="p-5">
            <Skeleton lines={6} />
          </div>
        ) : leadRows.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={<Inbox className="h-5 w-5" aria-hidden="true" />}
              title="Nessun lead"
              description="I contatti arrivano dal form del sito o da webhook: qui compariranno con nome, email, messaggio e stato del funnel."
              action={
                <Button
                  variant="primary"
                  leftIcon={<Send className="h-4 w-4" aria-hidden="true" />}
                  loading={sendMessage.isPending}
                  onClick={handleStartOutreach}
                >
                  Avvia outreach
                </Button>
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse text-sm">
              <caption className="sr-only">Elenco lead e prospect</caption>
              <thead>
                <tr className="border-b border-secondary/10 text-left text-xs text-text-muted">
                  <th scope="col" className="py-2 pl-5 pr-4 font-medium">Contatto</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Messaggio</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Fonte</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Stato</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Ricevuto il</th>
                  <th scope="col" className="py-2 pr-5 font-medium text-right">Aggiorna stato</th>
                </tr>
              </thead>
              <tbody>
                {leadRows.map((lead) => {
                  const status = isLeadStatus(lead.status) ? lead.status : "new";
                  const options = LEAD_TRANSITIONS[status].map((target) => ({
                    value: target,
                    label: LEAD_STATUS_LABEL[target],
                  }));
                  return (
                    <tr key={lead.id} className="border-b border-secondary/5">
                      <td className="py-3 pl-5 pr-4">
                        <span className="font-medium text-text-primary">{lead.name ?? "—"}</span>
                        <span className="block text-xs text-text-muted">{lead.email ?? "—"}</span>
                      </td>
                      <td className="max-w-[260px] py-3 pr-4 text-text-secondary">
                        {lead.message ?? "—"}
                      </td>
                      <td className="py-3 pr-4 text-text-secondary">{lead.source ?? "—"}</td>
                      <td className="py-3 pr-4">
                        <Badge variant={LEAD_STATUS_VARIANT[status]}>
                          {LEAD_STATUS_LABEL[status]}
                        </Badge>
                      </td>
                      <td className="py-3 pr-4 text-text-secondary">
                        {formatDate(leadCreatedAt(lead))}
                      </td>
                      <td className="py-3 pr-5 text-right">
                        {options.length === 0 ? (
                          <span className="text-xs text-text-muted">stato finale</span>
                        ) : (
                          <div className="flex justify-end">
                            <Select
                              aria-label={`Nuovo stato per ${lead.name ?? lead.email ?? "lead"}`}
                              className="min-w-[150px]"
                              options={[{ value: "", label: "Scegli…" }, ...options]}
                              value=""
                              disabled={pendingLeadId === lead.id}
                              onChange={(event) => {
                                const target = event.target.value;
                                if (isLeadStatus(target)) {
                                  void handleStatusChange(lead, target);
                                }
                              }}
                            />
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card header={<h2 className="text-base font-semibold text-text-primary">Moduli non disponibili</h2>}>
        <p className="text-sm text-text-secondary">
          Il BFF non espone campagne, sequenze di follow-up, tasso di risposta, riunioni fissate o
          automazioni di invio: sono dati che non vengono registrati e quindi non sono mostrati.
          L'avanzamento dei contatti si gestisce qui, tramite le transizioni di stato del funnel.
        </p>
      </Card>
    </div>
  );
}
