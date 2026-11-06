// =============================================================================
// Calendario editoriale (IA pazi "Content Calendar"). Dati reali dal BFF:
// edge social.scheduled (pubblicazioni pianificate) + social.post (contenuti
// prodotti) + social.summary (riepilogo per stato).
// Griglia del mese in corso con i contenuti pianificati per giorno.
// =============================================================================

import { useMemo, useState } from "react";
import { CalendarDays, FileText, Send } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { Tabs } from "@/components/ui/Tabs";
import { EmptyState, KpiCard, PageHeader } from "@/components/common/PageElements";
import { useSocialPosts, useSocialScheduledPosts, useSocialSummary } from "@/lib/platform-queries";
import { formatDate, formatDateTime, postKindLabel, postStatusLabel } from "@/lib/utils";

const STATUS_VARIANT: Record<string, "default" | "success" | "warning" | "error" | "info" | "accent"> = {
  scheduled: "info",
  published: "success",
  draft: "warning",
  failed: "error",
  queued: "accent",
};

function monthLabel(date: Date): string {
  return date.toLocaleDateString("it-IT", { month: "long", year: "numeric" });
}

function dayKey(value: string): string {
  return value.slice(0, 10);
}

export default function ContentCalendar() {
  const [month, setMonth] = useState(() => new Date());
  const [tab, setTab] = useState("calendar");

  const scheduled = useSocialScheduledPosts();
  const posts = useSocialPosts();
  const summary = useSocialSummary();

  const scheduledRows = scheduled.data ?? [];
  const postRows = posts.data ?? [];

  const byDay = useMemo(() => {
    const map = new Map<string, typeof scheduledRows>();
    for (const row of scheduledRows) {
      const reference = row.runAt ?? row.nextRunAt ?? row.createdAt;
      if (!reference) continue;
      const key = dayKey(reference);
      const bucket = map.get(key);
      if (bucket) bucket.push(row);
      else map.set(key, [row]);
    }
    return map;
  }, [scheduledRows]);

  const days = useMemo(() => {
    const year = month.getFullYear();
    const monthIndex = month.getMonth();
    const first = new Date(year, monthIndex, 1);
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    const cells: { date: Date; inMonth: boolean }[] = [];
    for (let index = 0; index < first.getDay(); index += 1) {
      cells.push({ date: new Date(year, monthIndex, 1 - index), inMonth: false });
    }
    for (let day = 1; day <= daysInMonth; day += 1) {
      cells.push({ date: new Date(year, monthIndex, day), inMonth: true });
    }
    return cells;
  }, [month]);

  const stats = useMemo(() => {
    const byStatus = summary.data?.scheduledByStatus ?? {};
    const scheduledCount = scheduledRows.length;
    const published = postRows.filter((post) => post.status === "published").length;
    const drafts = postRows.filter((post) => post.status === "draft").length;
    return {
      scheduled: scheduledCount,
      published,
      drafts,
      queued: byStatus.queued ?? 0,
      posts: postRows.length,
    };
  }, [scheduledRows, postRows, summary.data]);

  function shiftMonth(delta: number) {
    setMonth((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));
  }

  const tabs = [
    { value: "calendar", label: "Calendario" },
    { value: "scheduled", label: "Pianificati", badge: String(scheduledRows.length) },
    { value: "posts", label: "Contenuti", badge: String(postRows.length) },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Calendario editoriale"
        description="Contenuti pianificati e pubblicati: la pianificazione e' la stessa dei social e del pipeline."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => shiftMonth(-1)}>
              Mese precedente
            </Button>
            <span className="text-sm capitalize text-text-secondary">{monthLabel(month)}</span>
            <Button variant="ghost" size="sm" onClick={() => shiftMonth(1)}>
              Mese successivo
            </Button>
          </div>
        }
      />

      <section aria-label="Statistiche contenuti" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Pianificati"
          value={String(stats.scheduled)}
          icon={<CalendarDays className="h-5 w-5 text-secondary" aria-hidden="true" />}
        />
        <KpiCard label="Pubblicati" value={String(stats.published)} />
        <KpiCard label="Bozze" value={String(stats.drafts)} />
        <KpiCard label="Contenuti totali" value={String(stats.posts)} />
      </section>

      <Card className="flex flex-col gap-4">
        <Tabs items={tabs} value={tab} onValueChange={setTab} />
      </Card>

      {tab === "calendar" && (
        <Card bodyClassName="p-0">
          {scheduled.isLoading ? (
            <div className="p-5">
              <Skeleton lines={6} />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-7">
              {["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"].map((label) => (
                <div
                  key={label}
                  className="border-b border-secondary/10 px-3 py-2 text-xs font-medium uppercase tracking-wide text-text-muted sm:border-r"
                >
                  {label}
                </div>
              ))}
              {days.map(({ date, inMonth }) => {
                const key = dayKey(date.toISOString());
                const entries = byDay.get(key) ?? [];
                const today = key === dayKey(new Date().toISOString());
                return (
                  <div
                    key={key}
                    className={
                      "min-h-[92px] border-b border-secondary/10 px-3 py-2 sm:border-r " +
                      (inMonth ? "" : "bg-bg-hover/40 text-text-muted")
                    }
                  >
                    <span
                      className={
                        "inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs " +
                        (today ? "bg-secondary text-secondary-foreground" : "text-text-muted")
                      }
                    >
                      {date.getDate()}
                    </span>
                    <ul className="mt-1 space-y-1">
                      {entries.map((entry) => (
                        <li key={entry.id}>
                          <span
                            className="block truncate rounded bg-secondary/15 px-1.5 py-0.5 text-[11px] text-text-primary"
                            title={entry.title}
                          >
                            {entry.title}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {tab === "scheduled" && (
        <Card bodyClassName="p-0">
          {scheduled.isLoading ? (
            <div className="p-5">
              <Skeleton lines={5} />
            </div>
          ) : scheduledRows.length === 0 ? (
            <EmptyState
              icon={<Send className="h-5 w-5" aria-hidden="true" />}
              title="Nessuna pubblicazione pianificata"
              description="Le pubblicazioni con data di uscita fissata compariranno qui e nel calendario."
            />
          ) : (
            <ul className="divide-y divide-secondary/10">
              {scheduledRows.map((row) => (
                <li key={row.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-text-primary">{row.title}</p>
                    <p className="text-xs text-text-muted">
                      {postKindLabel(row.kind)} ·{" "}
                      {row.runAt ? formatDateTime(row.runAt) : row.cron ?? "—"} · {row.timezone}
                    </p>
                  </div>
                  <Badge variant={STATUS_VARIANT[row.status] ?? "default"} className="ml-auto">
                    {postStatusLabel(row.status)}
                  </Badge>
                  {row.nextRunAt && (
                    <span className="text-xs text-text-muted">prossima: {formatDate(row.nextRunAt)}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {tab === "posts" && (
        <Card bodyClassName="p-0">
          {posts.isLoading ? (
            <div className="p-5">
              <Skeleton lines={5} />
            </div>
          ) : postRows.length === 0 ? (
            <EmptyState
              icon={<FileText className="h-5 w-5" aria-hidden="true" />}
              title="Nessun contenuto"
              description="I deliverable prodotti dal pipeline (testi, immagini, video) compariranno qui."
            />
          ) : (
            <ul className="divide-y divide-secondary/10">
              {postRows.map((post) => (
                <li key={post.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-text-primary">{post.name}</p>
                    <p className="text-xs text-text-muted">
                      {postKindLabel(post.kind)} · {formatDate(post.createdAt)}
                      {post.mime ? ` · ${post.mime}` : ""}
                    </p>
                  </div>
                  <Badge variant={STATUS_VARIANT[post.status] ?? "default"} className="ml-auto">
                    {postStatusLabel(post.status)}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}
