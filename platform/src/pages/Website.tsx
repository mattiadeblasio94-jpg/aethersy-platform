// =============================================================================
// Sito Web (brief §3.6) — rotta /website. Stato del sito, pagine, report SEO,
// messaggi dal form contatti e KPI di traffico.
// =============================================================================

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  FileText,
  Globe,
  Inbox,
  Rocket,
  XCircle,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { Tabs } from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/Toast";
import { EmptyState, KpiCard, PageHeader, ProgressBar } from "@/components/common/PageElements";
import {
  useContactSubmissions,
  usePublishSitePage,
  useSeoReport,
  useSiteOverview,
  useSitePages,
} from "@/lib/queries";
import type { SeoCheckStatus, SitePageStatus } from "@/lib/types";
import { formatDateTime, formatNumber, formatPercent, formatRelative, sitePageStatusLabel } from "@/lib/utils";

const PAGE_STATUS_VARIANT: Record<SitePageStatus, "success" | "warning" | "default"> = {
  published: "success",
  review: "warning",
  draft: "default",
};

const SEO_ICON: Record<SeoCheckStatus, typeof CheckCircle2> = {
  ok: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
};

const SEO_COLOR: Record<SeoCheckStatus, string> = {
  ok: "text-success",
  warning: "text-warning",
  error: "text-error",
};

const MESSAGE_TABS = [
  { value: "all", label: "Tutti" },
  { value: "unread", label: "Non letti" },
];

export default function Website() {
  const { toast } = useToast();
  const [messageTab, setMessageTab] = useState("all");

  const overview = useSiteOverview();
  const pages = useSitePages();
  const seo = useSeoReport();
  const submissions = useContactSubmissions();
  const publishPage = usePublishSitePage();

  const seoScore = seo.data?.score ?? 0;
  const seoColor = seoScore >= 90 ? "text-success" : seoScore >= 70 ? "text-warning" : "text-error";

  const filteredMessages = useMemo(() => {
    const list = submissions.data ?? [];
    return messageTab === "unread" ? list.filter((item) => !item.read) : list;
  }, [submissions.data, messageTab]);

  const unreadCount = (submissions.data ?? []).filter((item) => !item.read).length;

  async function handlePublish(pageId: string, title: string) {
    try {
      await publishPage.mutateAsync(pageId);
      toast({ kind: "success", title: "Pagina pubblicata", description: `${title} e' ora online.` });
    } catch {
      toast({ kind: "error", title: "Pubblicazione non riuscita" });
    }
  }

  function handleDeploy() {
    toast({ kind: "info", title: "Deploy avviato", description: "Il sito sara' aggiornato a breve (mock)." });
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Sito Web"
        description="Gestisci pagine, contenuti e posizionamento del tuo sito."
        actions={
          <Button
            variant="primary"
            leftIcon={<Rocket className="h-4 w-4" aria-hidden="true" />}
            onClick={handleDeploy}
          >
            Deploy
          </Button>
        }
      />

      {/* Stato sito + KPI */}
      <section aria-label="Stato del sito" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {overview.isLoading ? (
          Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-28 rounded-xl" />
          ))
        ) : (
          <>
            <Card className="flex flex-col gap-2 sm:col-span-2 xl:col-span-1">
              <div className="flex items-center justify-between">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary/15">
                  <Globe className="h-5 w-5 text-secondary" aria-hidden="true" />
                </span>
                <Badge variant={overview.data?.status === "published" ? "success" : "warning"}>
                  {overview.data?.status === "published" ? "Online" : "Bozza"}
                </Badge>
              </div>
              <div>
                <p className="truncate text-sm font-medium text-text-primary">
                  {overview.data?.domain}
                </p>
                <p className="text-xs text-text-muted">
                  Ultimo deploy {formatRelative(overview.data?.lastDeploy ?? null)}
                </p>
              </div>
            </Card>
            <KpiCard
              label="Visitatori"
              value={formatNumber(overview.data?.visitors ?? 0)}
              icon={<Eye className="h-5 w-5 text-secondary" aria-hidden="true" />}
              delta="+8,2%"
              trend="up"
            />
            <KpiCard
              label="Visualizzazioni"
              value={formatNumber(overview.data?.pageViews ?? 0)}
              icon={<FileText className="h-5 w-5 text-secondary" aria-hidden="true" />}
              delta="+5,1%"
              trend="up"
            />
            <KpiCard
              label="Frequenza di rimbalzo"
              value={formatPercent(overview.data?.bounceRate ?? 0)}
              icon={<AlertTriangle className="h-5 w-5 text-secondary" aria-hidden="true" />}
              delta="-1,8 pt"
              trend="down"
              inverse
            />
          </>
        )}
      </section>

      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        {/* Pagine */}
        <Card
          header={
            <>
              <h2 className="text-base font-semibold text-text-primary">Pagine</h2>
              <span className="text-xs text-text-muted">{pages.data?.length ?? 0} pagine</span>
            </>
          }
          bodyClassName="p-0"
        >
          {pages.isLoading ? (
            <div className="p-5">
              <Skeleton lines={5} />
            </div>
          ) : (pages.data ?? []).length === 0 ? (
            <div className="p-5">
              <EmptyState title="Nessuna pagina" description="Il sito non ha ancora pagine pubblicate." />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-sm">
                <caption className="sr-only">Pagine del sito</caption>
                <thead>
                  <tr className="border-b border-secondary/10 text-left text-xs text-text-muted">
                    <th scope="col" className="py-2 pl-5 pr-4 font-medium">Titolo</th>
                    <th scope="col" className="py-2 pr-4 font-medium">Percorso</th>
                    <th scope="col" className="py-2 pr-4 font-medium">Stato</th>
                    <th scope="col" className="py-2 pr-4 font-medium">Visite</th>
                    <th scope="col" className="py-2 pr-5 font-medium text-right">Azioni</th>
                  </tr>
                </thead>
                <tbody>
                  {(pages.data ?? []).map((page) => (
                    <tr key={page.id} className="border-b border-secondary/5">
                      <td className="py-3 pl-5 pr-4">
                        <span className="font-medium text-text-primary">{page.title}</span>
                        <span className="block text-xs text-text-muted">
                          aggiornata {formatRelative(page.updatedAt)}
                        </span>
                      </td>
                      <td className="py-3 pr-4 font-mono text-xs text-text-secondary">{page.path}</td>
                      <td className="py-3 pr-4">
                        <Badge variant={PAGE_STATUS_VARIANT[page.status]}>
                          {sitePageStatusLabel(page.status)}
                        </Badge>
                      </td>
                      <td className="py-3 pr-4 text-text-secondary">{formatNumber(page.views)}</td>
                      <td className="py-3 pr-5 text-right">
                        {page.status !== "published" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            loading={publishPage.isPending && publishPage.variables === page.id}
                            onClick={() => handlePublish(page.id, page.title)}
                          >
                            Pubblica
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* SEO */}
        <Card header={<h2 className="text-base font-semibold text-text-primary">Posizionamento SEO</h2>}>
          {seo.isLoading ? (
            <Skeleton lines={5} />
          ) : (
            <div className="flex flex-col gap-5">
              <div className="flex items-center gap-4">
                <span className={`font-display text-4xl font-semibold ${seoColor}`}>{seoScore}</span>
                <div className="flex-1">
                  <p className="text-sm font-medium text-text-primary">Punteggio SEO</p>
                  <p className="text-xs text-text-muted">su 100 — basato su {seo.data?.checks.length ?? 0} controlli</p>
                </div>
              </div>
              <ProgressBar value={seoScore} label="Stato complessivo" />
              <ul className="flex flex-col gap-3">
                {(seo.data?.checks ?? []).map((check) => {
                  const Icon = SEO_ICON[check.status];
                  return (
                    <li key={check.id} className="flex items-start gap-3">
                      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${SEO_COLOR[check.status]}`} aria-hidden="true" />
                      <div>
                        <p className="text-sm font-medium text-text-primary">{check.label}</p>
                        <p className="text-xs text-text-muted">{check.description}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </Card>
      </div>

      {/* Messaggi dal form contatti */}
      <Card
        header={
          <>
            <h2 className="text-base font-semibold text-text-primary">Messaggi dal sito</h2>
            {unreadCount > 0 && <Badge variant="info">{unreadCount} non letti</Badge>}
          </>
        }
      >
        <div className="mb-4">
          <Tabs items={MESSAGE_TABS} value={messageTab} onValueChange={setMessageTab} />
        </div>

        {submissions.isLoading ? (
          <Skeleton lines={4} />
        ) : filteredMessages.length === 0 ? (
          <EmptyState
            icon={<Inbox className="h-5 w-5" aria-hidden="true" />}
            title="Nessun messaggio"
            description="Non ci sono messaggi da mostrare."
          />
        ) : (
          <ul className="flex flex-col divide-y divide-secondary/10">
            {filteredMessages.map((message) => (
              <li key={message.id} className="flex flex-col gap-1.5 py-3.5 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-text-primary">{message.name}</span>
                  {!message.read && <Badge variant="info">Nuovo</Badge>}
                  <span className="text-xs text-text-muted">{formatDateTime(message.date)}</span>
                </div>
                <p className="text-sm text-text-secondary">{message.subject}</p>
                <p className="text-sm text-text-muted">{message.message}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
