import { useMemo, useState } from "react";
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
  useDisconnectPlatform,
  useIntegrations,
  usePlatforms,
  useRevokeIntegration,
  useSaveIntegration,
  useSaveWebhook,
  useTestIntegration,
  useWebhookDeliveries,
} from "@/lib/platform-queries";
import { formatDate, formatDateTime, platformLabel } from "@/lib/utils";

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "Operazione non riuscita";
}

export default function SettingsIntegrations() {
  const { toast } = useToast();
  const platforms = usePlatforms();
  const integrations = useIntegrations();
  const disconnectPlatform = useDisconnectPlatform();
  const saveIntegration = useSaveIntegration();
  const testIntegration = useTestIntegration();
  const revokeIntegration = useRevokeIntegration();
  const [slackUrl, setSlackUrl] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const saveWebhook = useSaveWebhook();
  const deliveries = useWebhookDeliveries();

  const webhookRows = (integrations.data ?? []).filter(
    (item) => item.provider === "webhook" && item.status !== "revoked",
  );

  async function handleSaveWebhook() {
    const url = webhookUrl.trim();
    if (!url) {
      toast({
        kind: "error",
        title: "URL mancante",
        description: "Inserisci l'endpoint https che riceve gli eventi.",
      });
      return;
    }
    try {
      await saveWebhook.mutateAsync({ url, signingSecret: webhookSecret.trim() || undefined });
      setWebhookUrl("");
      setWebhookSecret("");
      toast({
        kind: "success",
        title: "Webhook salvato",
        description: "Gli eventi della pipeline verranno consegnati a questo endpoint.",
      });
    } catch (error) {
      toast({ kind: "error", title: "Salvataggio non riuscito", description: errorText(error) });
    }
  }

  async function handleTest(id: string, message: string) {
    try {
      await testIntegration.mutateAsync({ id, message });
      toast({
        kind: "success",
        title: "Evento di prova inviato",
        description: "L'endpoint ha risposto 200.",
      });
    } catch (error) {
      toast({ kind: "error", title: "Test non riuscito", description: errorText(error) });
    }
  }

  async function handleRevoke(id: string, label: string) {
    try {
      await revokeIntegration.mutateAsync(id);
      toast({ kind: "info", title: `${label} revocato`, description: "Il canale non e' piu' usato." });
    } catch (error) {
      toast({ kind: "error", title: "Revoca non riuscita", description: errorText(error) });
    }
  }

  const slackCredential = (integrations.data ?? []).find(
    (item) => item.provider === "slack" && item.status !== "revoked",
  );

  async function handleSaveSlack() {
    const url = slackUrl.trim();
    if (!url) {
      toast({
        kind: "error",
        title: "URL mancante",
        description: "Incolla l'URL del webhook Incoming Webhook di Slack.",
      });
      return;
    }
    try {
      await saveIntegration.mutateAsync({
        provider: "slack",
        kind: "webhook",
        label: "Slack",
        secret: url,
        scopes: ["lead.created", "run.delivered"],
      });
      setSlackUrl("");
      toast({
        kind: "success",
        title: "Slack salvato",
        description: "Il webhook e' cifrato lato server: da qui in poi i lead arrivano sul canale.",
      });
    } catch (error) {
      toast({ kind: "error", title: "Salvataggio non riuscito", description: errorText(error) });
    }
  }

  async function handleTestSlack() {
    if (!slackCredential) return;
    try {
      await testIntegration.mutateAsync({ id: slackCredential.id });
      toast({
        kind: "success",
        title: "Messaggio di prova inviato",
        description: "Slack ha risposto 200: il canale e' operativo.",
      });
    } catch (error) {
      toast({ kind: "error", title: "Test non riuscito", description: errorText(error) });
    }
  }

  async function handleRevokeSlack() {
    if (!slackCredential) return;
    try {
      await revokeIntegration.mutateAsync(slackCredential.id);
      toast({ kind: "info", title: "Slack revocato", description: "Il webhook del tenant non e' piu' usato." });
    } catch (error) {
      toast({ kind: "error", title: "Revoca non riuscita", description: errorText(error) });
    }
  }

  const detailsById = useMemo(() => {
    const map = new Map<string, { scopes: string[]; createdAt: string; meta: Record<string, unknown> }>();
    for (const item of integrations.data ?? []) {
      map.set(item.id, { scopes: item.scopes ?? [], createdAt: item.createdAt, meta: item.meta ?? {} });
    }
    return map;
  }, [integrations.data]);

  const rows = platforms.data ?? [];
  const activeCount = rows.filter((row) => row.connected).length;

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
                <WebhookIcon className="h-4 w-4 text-secondary" aria-hidden="true" />
                Slack: notifiche lead e consegne
              </h3>
              <Badge variant={slackCredential ? "success" : "warning"}>
                {slackCredential ? slackCredential.status : "non configurato"}
              </Badge>
            </>
          }
        >
          <div className="flex flex-col gap-3">
            <p className="text-sm text-text-secondary">
              Incolla l&apos;URL del webhook Incoming Webhook di Slack: viene cifrato lato server
              (AES-256-GCM) e da qui in poi ogni lead del sito e ogni run consegnato arrivano sul
              canale. Il segreto non viene mai restituito al browser.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="url"
                value={slackUrl}
                onChange={(event) => setSlackUrl(event.target.value)}
                placeholder="https://hooks.slack.com/services/..."
                aria-label="URL webhook Slack"
                className="min-w-[280px] flex-1 rounded-lg border border-secondary/20 bg-bg-hover px-3 py-2 text-sm text-text-primary outline-none focus:border-secondary/40"
              />
              <Button size="sm" loading={saveIntegration.isPending} onClick={handleSaveSlack}>
                Salva webhook
              </Button>
              {slackCredential ? (
                <>
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={testIntegration.isPending}
                    onClick={handleTestSlack}
                  >
                    Invia test
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    loading={revokeIntegration.isPending}
                    onClick={handleRevokeSlack}
                  >
                    Revoca
                  </Button>
                </>
              ) : null}
            </div>
            {slackCredential ? (
              <p className="text-xs text-text-muted">
                Configurato il {formatDate(slackCredential.createdAt)} · permessi:{" "}
                {(slackCredential.scopes ?? []).join(", ") || "nessuno"}
              </p>
            ) : (
              <p className="text-xs text-text-muted">
                Senza webhook del tenant le notifiche usano il canale di stack, se configurato.
              </p>
            )}
          </div>
        </Card>

        <Card
          header={
            <>
              <h3 className="flex items-center gap-2 text-base font-semibold text-text-primary">
                <Share2 className="h-4 w-4 text-secondary" aria-hidden="true" />
                Canali registrati
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
                description="I canali social richiedono le credenziali dell'app del provider: senza OAuth configurato non viene creata una connessione fittizia. Il canale operativo e' Slack, configurabile qui sopra."
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
                    ) : null}
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
            <>
              <h3 className="flex items-center gap-2 text-base font-semibold text-text-primary">
                <WebhookIcon className="h-4 w-4 text-secondary" aria-hidden="true" />
                Webhook in uscita
              </h3>
              <span className="text-xs text-text-muted">{webhookRows.length} registrati</span>
            </>
          }
        >
          <div className="flex flex-col gap-3">
            <p className="text-sm text-text-secondary">
              Punto di ricezione per gli eventi della pipeline: ogni lead del sito e ogni run
              consegnato arrivano come POST JSON con <code>X-Aethersy-Event</code> e firma
              <code> X-Aethersy-Signature</code> (HMAC-SHA256). URL e secret sono cifrati lato
              server.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="url"
                value={webhookUrl}
                onChange={(event) => setWebhookUrl(event.target.value)}
                placeholder="https://hook.example.com/aethersy"
                aria-label="URL webhook in uscita"
                className="min-w-[260px] flex-1 rounded-lg border border-secondary/20 bg-bg-hover px-3 py-2 text-sm text-text-primary outline-none focus:border-secondary/40"
              />
              <input
                type="password"
                value={webhookSecret}
                onChange={(event) => setWebhookSecret(event.target.value)}
                placeholder="secret di firma (opzionale)"
                aria-label="Secret di firma del webhook"
                className="min-w-[200px] flex-1 rounded-lg border border-secondary/20 bg-bg-hover px-3 py-2 text-sm text-text-primary outline-none focus:border-secondary/40"
              />
              <Button size="sm" loading={saveWebhook.isPending} onClick={handleSaveWebhook}>
                Salva webhook
              </Button>
            </div>
            {deliveries.data && deliveries.data.deliveries.length > 0 ? (
              <div className="rounded-lg border border-secondary/15 p-3">
                <p className="text-xs font-medium text-text-secondary">
                  Eventi realmente consegnati ({deliveries.data.deliveries.length})
                </p>
                <ul className="mt-2 flex flex-col gap-1.5">
                  {deliveries.data.deliveries.slice(0, 6).map((item) => (
                    <li key={item.id} className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
                      <Badge variant="success">{item.event}</Badge>
                      <span>{formatDateTime(item.receivedAt)}</span>
                      <span className="truncate">
                        {item.signature
                          ? `firma ${item.signature.slice(0, 18)}...`
                          : "senza firma"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {webhookRows.length > 0 ? (
              <ul className="divide-y divide-secondary/10 rounded-lg border border-secondary/15">
                {webhookRows.map((row) => (
                  <li key={row.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                    <span className="min-w-0 flex-1 truncate text-sm text-text-primary">
                      {typeof row.meta?.host === "string" && row.meta.host
                        ? row.meta.host
                        : row.label || "webhook"}
                    </span>
                    <Badge variant={row.status === "active" ? "success" : "warning"}>{row.status}</Badge>
                    <Button
                      variant="secondary"
                      size="sm"
                      loading={testIntegration.isPending && testIntegration.variables?.id === row.id}
                      onClick={() => handleTest(row.id, "Aethersy - evento di prova")}
                    >
                      Invia test
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      loading={revokeIntegration.isPending && revokeIntegration.variables === row.id}
                      onClick={() => handleRevoke(row.id, "Webhook")}
                    >
                      Revoca
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-text-muted">
                Nessun webhook registrato: gli eventi restano consultabili in piattaforma.
              </p>
            )}
          </div>
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
