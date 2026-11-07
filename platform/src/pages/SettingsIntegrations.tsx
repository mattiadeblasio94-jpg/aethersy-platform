import { useMemo } from "react";
import { KeyRound, Link2, Share2, Webhook as WebhookIcon } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { SettingsLayout } from "@/components/settings/SettingsLayout";
import { EmptyState } from "@/components/common/PageElements";
import { PageTransition } from "@/components/common/Motion";
import {
  useConnectPlatform,
  useDisconnectPlatform,
  useIntegrations,
  usePlatforms,
} from "@/lib/platform-queries";
import { formatDate, platformLabel } from "@/lib/utils";

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "Operazione non riuscita";
}

export default function SettingsIntegrations() {
  const { toast } = useToast();
  const platforms = usePlatforms();
  const integrations = useIntegrations();
  const connectPlatform = useConnectPlatform();
  const disconnectPlatform = useDisconnectPlatform();

  const detailsById = useMemo(() => {
    const map = new Map<string, { scopes: string[]; createdAt: string; meta: Record<string, unknown> }>();
    for (const item of integrations.data ?? []) {
      map.set(item.id, { scopes: item.scopes ?? [], createdAt: item.createdAt, meta: item.meta ?? {} });
    }
    return map;
  }, [integrations.data]);

  const rows = platforms.data ?? [];
  const activeCount = rows.filter((row) => row.connected).length;

  async function handleConnect(provider: string) {
    try {
      await connectPlatform.mutateAsync(provider);
      toast({
        kind: "success",
        title: "Canale collegato",
        description: `${platformLabel(provider)} e' ora attivo sul tenant.`,
      });
    } catch (error) {
      toast({ kind: "error", title: "Collegamento non riuscito", description: errorText(error) });
    }
  }

  async function handleDisconnect(id: string, label: string) {
    try {
      await disconnectPlatform.mutateAsync(id);
      toast({ kind: "info", title: "Canale disconnesso", description: label });
    } catch (error) {
      toast({ kind: "error", title: "Disconnessione non riuscita", description: errorText(error) });
    }
  }

  return (
    <PageTransition>
      <SettingsLayout
        title="Integrazioni"
        description="Canali registrati sul tenant: collegamento, revoca e permessi dichiarati dall'integrazione."
      >
        <Card
          header={
            <>
              <h3 className="flex items-center gap-2 text-base font-semibold text-text-primary">
                <Share2 className="h-4 w-4 text-secondary" aria-hidden="true" />
                Canali social
              </h3>
              <span className="text-xs text-text-muted">{activeCount} attivi</span>
            </>
          }
          bodyClassName="p-0"
        >
          {platforms.isLoading || integrations.isLoading ? (
            <div className="p-5">
              <Skeleton lines={4} />
            </div>
          ) : platforms.isError || integrations.isError ? (
            <div className="p-5">
              <EmptyState
                icon={<Share2 className="h-5 w-5" aria-hidden="true" />}
                title="Integrazioni non disponibili"
                description={errorText(platforms.error ?? integrations.error)}
                action={
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      platforms.refetch();
                      integrations.refetch();
                    }}
                  >
                    Ricarica canali
                  </Button>
                }
              />
            </div>
          ) : rows.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={<Share2 className="h-5 w-5" aria-hidden="true" />}
                title="Nessun canale registrato"
                description="Il BFF espone solo i canali gia' registrati sul tenant: la creazione di una nuova connessione avviene dal pipeline."
                action={
                  <Button variant="secondary" size="sm" onClick={() => platforms.refetch()}>
                    Ricarca canali
                  </Button>
                }
              />
            </div>
          ) : (
            <ul className="divide-y divide-secondary/10">
              {rows.map((row) => {
                const detail = detailsById.get(row.id);
                return (
                  <li key={row.id} className="flex flex-wrap items-start gap-4 px-5 py-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-text-primary">
                        {platformLabel(row.provider)}
                        {row.label && row.label !== row.provider ? (
                          <span className="text-xs text-text-muted"> · {row.label}</span>
                        ) : null}
                      </p>
                      <p className="mt-0.5 text-xs text-text-muted">
                        {row.kind}
                        {detail?.createdAt ? ` · registrato il ${formatDate(detail.createdAt)}` : ""}
                      </p>
                      {detail && detail.scopes.length > 0 && (
                        <p className="mt-1 flex flex-wrap gap-1">
                          {detail.scopes.map((scope) => (
                            <span
                              key={scope}
                              className="rounded-full bg-bg-hover px-2 py-0.5 text-[11px] text-text-secondary"
                            >
                              {scope}
                            </span>
                          ))}
                        </p>
                      )}
                    </div>
                    <Badge variant={row.connected ? "success" : "warning"}>{row.status}</Badge>
                    {row.connected ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        loading={
                          disconnectPlatform.isPending && disconnectPlatform.variables === row.id
                        }
                        onClick={() => handleDisconnect(row.id, platformLabel(row.provider))}
                      >
                        Disconnetti
                      </Button>
                    ) : (
                      <Button
                        variant="secondary"
                        size="sm"
                        loading={
                          connectPlatform.isPending && connectPlatform.variables === row.provider
                        }
                        onClick={() => handleConnect(row.provider)}
                      >
                        Collega
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card
          header={
            <h3 className="flex items-center gap-2 text-base font-semibold text-text-primary">
              <KeyRound className="h-4 w-4 text-secondary" aria-hidden="true" />
              Chiavi API
            </h3>
          }
        >
          <EmptyState
            icon={<KeyRound className="h-5 w-5" aria-hidden="true" />}
            title="Chiavi API non disponibili"
            description="Il BFF non espone un endpoint per creare o revocare chiavi API del tenant: la gestione delle credenziali resta lato server."
          />
        </Card>

        <Card
          header={
            <h3 className="flex items-center gap-2 text-base font-semibold text-text-primary">
              <WebhookIcon className="h-4 w-4 text-secondary" aria-hidden="true" />
              Webhook
            </h3>
          }
        >
          <EmptyState
            icon={<WebhookIcon className="h-5 w-5" aria-hidden="true" />}
            title="Webhook non disponibili"
            description="Non esiste un endpoint di gestione webhook: gli eventi interni restano consultabili dai log di run e task."
          />
        </Card>

        <Card
          header={
            <h3 className="flex items-center gap-2 text-base font-semibold text-text-primary">
              <Link2 className="h-4 w-4 text-secondary" aria-hidden="true" />
              Come funziona il collegamento
            </h3>
          }
        >
          <p className="text-sm text-text-secondary">
            Il collegamento attiva o riattiva la credenziale del provider sul tenant; la
            disconnessione revoca la credenziale e la porta in stato non attivo. I segreti OAuth non
            transitano dalla SPA: sono gestiti dal BFF.
          </p>
        </Card>
      </SettingsLayout>
    </PageTransition>
  );
}
