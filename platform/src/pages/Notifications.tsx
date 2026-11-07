import { useNavigate } from "react-router-dom";
import { Bell, CheckCheck, Rocket, Inbox, PackageCheck } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { EmptyState, PageHeader } from "@/components/common/PageElements";
import { PageTransition } from "@/components/common/Motion";
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
} from "@/lib/platform-queries";
import type { NotificationItem } from "@/lib/platform-api";
import { formatDateTime } from "@/lib/utils";

const SEVERITY_VARIANT: Record<
  NotificationItem["severity"],
  "default" | "success" | "warning" | "error"
> = {
  info: "default",
  success: "success",
  warning: "warning",
  critical: "error",
};

function kindIcon(kind: string) {
  if (kind === "deploy") return <Rocket className="h-4 w-4" aria-hidden="true" />;
  if (kind === "lead.created") return <Inbox className="h-4 w-4" aria-hidden="true" />;
  if (kind === "run.delivered") return <PackageCheck className="h-4 w-4" aria-hidden="true" />;
  return <Bell className="h-4 w-4" aria-hidden="true" />;
}

export default function Notifications() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const notifications = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const rows = notifications.data?.notifications ?? [];
  const unread = notifications.data?.unread ?? 0;

  async function handleOpen(item: NotificationItem) {
    try {
      await markRead.mutateAsync(item.id);
    } catch {
      // La lettura e' comunque registrata lato server: l'errore non blocca l'apertura.
    }
    if (item.link) navigate(item.link);
  }

  async function handleMarkAll() {
    try {
      const result = await markAllRead.mutateAsync();
      toast({
        kind: "success",
        title: "Notifiche segnate come lette",
        description: `${result.updated} notifiche aggiornate.`,
      });
    } catch {
      toast({ kind: "error", title: "Operazione non riuscita", description: "Riprova fra poco." });
    }
  }

  return (
    <PageTransition>
      <PageHeader
        title="Notifiche"
        description="Eventi reali della piattaforma: deploy, lead dal sito, run consegnate."
        actions={
          unread > 0 ? (
            <Button variant="secondary" size="sm" loading={markAllRead.isPending} onClick={handleMarkAll}>
              <CheckCheck className="h-4 w-4" aria-hidden="true" />
              Segna tutte come lette
            </Button>
          ) : null
        }
      />

      <Card bodyClassName="p-0">
        {notifications.isLoading ? (
          <div className="p-5">
            <Skeleton lines={5} />
          </div>
        ) : notifications.isError ? (
          <div className="p-5">
            <EmptyState
              icon={<Bell className="h-5 w-5" aria-hidden="true" />}
              title="Notifiche non disponibili"
              description="Il BFF non ha risposto: riprova fra poco."
              action={
                <Button variant="secondary" size="sm" onClick={() => notifications.refetch()}>
                  Ricarica
                </Button>
              }
            />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={<Bell className="h-5 w-5" aria-hidden="true" />}
              title="Nessuna notifica"
              description="Qui compaiono i deploy, i lead raccolti dal sito e le run consegnate."
            />
          </div>
        ) : (
          <ul className="divide-y divide-secondary/10">
            {rows.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => handleOpen(item)}
                  className="flex w-full items-start gap-3 px-5 py-4 text-left transition-colors hover:bg-bg-hover"
                >
                  <span className="mt-0.5 text-secondary">{kindIcon(item.kind)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-text-primary">{item.title}</span>
                      <Badge variant={SEVERITY_VARIANT[item.severity]}>{item.severity}</Badge>
                      {item.scope === "platform" ? <Badge variant="default">piattaforma</Badge> : null}
                      {!item.read ? <Badge variant="success">nuova</Badge> : null}
                    </span>
                    {item.body ? (
                      <span className="mt-1 block text-xs text-text-muted">{item.body}</span>
                    ) : null}
                    <span className="mt-1 block text-[11px] text-text-muted">
                      {formatDateTime(item.createdAt)} · {item.kind}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </PageTransition>
  );
}
