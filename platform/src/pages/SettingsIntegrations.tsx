// =============================================================================
// Impostazioni > Integrazioni (brief §4) — rotta /settings/integrations.
// Riusa PlatformGrid per i canali social, piu' chiavi API (prefisso mascherato,
// crea/revoca con conferma) e webhook (URL, eventi, stato). Nessun token o
// chiave completa viene mai mostrato o salvato.
// =============================================================================

import { useState } from "react";
import type { FormEvent } from "react";
import { KeyRound, Plus, Share2, Trash2, Webhook as WebhookIcon } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { SettingsLayout } from "@/components/settings/SettingsLayout";
import { EmptyState } from "@/components/common/PageElements";
import { PageTransition } from "@/components/common/Motion";
import { PlatformGrid } from "@/components/domain/PlatformGrid";
import { ConnectionModal } from "@/components/domain/ConnectionModal";
import {
  useApiKeys,
  useConnectPlatform,
  useCreateApiKey,
  useCreateWebhook,
  useDisconnectPlatform,
  usePlatforms,
  useRemoveWebhook,
  useRevokeApiKey,
  useWebhooks,
} from "@/lib/queries";
import { webhookEventOptions } from "@/mocks";
import type { ApiKey, Platform, PlatformId, Webhook, WebhookStatus } from "@/lib/types";
import { formatDate, formatRelative, platformLabel } from "@/lib/utils";

const WEBHOOK_STATUS: Record<WebhookStatus, { label: string; variant: "success" | "warning" | "error" }> = {
  active: { label: "Attivo", variant: "success" },
  paused: { label: "In pausa", variant: "warning" },
  error: { label: "Errore", variant: "error" },
};

const ENVIRONMENT_OPTIONS = [
  { value: "live", label: "Produzione (live)" },
  { value: "test", label: "Test" },
];

export default function SettingsIntegrations() {
  const { toast } = useToast();

  const platforms = usePlatforms();
  const connectPlatform = useConnectPlatform();
  const disconnectPlatform = useDisconnectPlatform();

  const apiKeys = useApiKeys();
  const createApiKey = useCreateApiKey();
  const revokeApiKey = useRevokeApiKey();

  const webhooks = useWebhooks();
  const createWebhook = useCreateWebhook();
  const removeWebhook = useRemoveWebhook();

  const [connectionTarget, setConnectionTarget] = useState<Platform | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<ApiKey | null>(null);
  const [removeWebhookTarget, setRemoveWebhookTarget] = useState<Webhook | null>(null);

  const [keyModalOpen, setKeyModalOpen] = useState(false);
  const [keyName, setKeyName] = useState("");
  const [keyEnv, setKeyEnv] = useState<ApiKey["environment"]>("live");
  const [keyError, setKeyError] = useState<string | null>(null);

  const [webhookModalOpen, setWebhookModalOpen] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookEvents, setWebhookEvents] = useState<string[]>(["task.completed"]);
  const [webhookError, setWebhookError] = useState<string | null>(null);

  // --- Piattaforme ---------------------------------------------------------

  async function handleConfirmConnection(platformId: PlatformId) {
    await connectPlatform.mutateAsync(platformId);
  }

  async function handleDisconnect(platformId: PlatformId) {
    try {
      await disconnectPlatform.mutateAsync(platformId);
      toast({ kind: "info", title: "Piattaforma disconnessa", description: platformLabel(platformId) });
    } catch {
      toast({ kind: "error", title: "Disconnessione non riuscita" });
    }
  }

  // --- Chiavi API ----------------------------------------------------------

  async function handleCreateKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!keyName.trim()) {
      setKeyError("Assegna un nome alla chiave.");
      return;
    }
    setKeyError(null);
    try {
      await createApiKey.mutateAsync({ name: keyName.trim(), environment: keyEnv });
      toast({
        kind: "success",
        title: "Chiave creata",
        description: "Copia la chiave ora: non sara' piu' visibile.",
      });
      setKeyModalOpen(false);
      setKeyName("");
    } catch {
      toast({ kind: "error", title: "Creazione non riuscita" });
    }
  }

  async function handleRevokeKey() {
    if (!revokeTarget) return;
    try {
      await revokeApiKey.mutateAsync(revokeTarget.id);
      toast({ kind: "info", title: "Chiave revocata", description: revokeTarget.name });
      setRevokeTarget(null);
    } catch {
      toast({ kind: "error", title: "Revoca non riuscita" });
    }
  }

  // --- Webhook -------------------------------------------------------------

  function toggleWebhookEvent(value: string) {
    setWebhookEvents((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value],
    );
  }

  async function handleCreateWebhook(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/^https:\/\/.+\..+/.test(webhookUrl)) {
      setWebhookError("Inserisci un URL HTTPS valido.");
      return;
    }
    if (webhookEvents.length === 0) {
      setWebhookError("Seleziona almeno un evento.");
      return;
    }
    setWebhookError(null);
    try {
      await createWebhook.mutateAsync({ url: webhookUrl.trim(), events: webhookEvents });
      toast({ kind: "success", title: "Webhook creato", description: webhookUrl });
      setWebhookModalOpen(false);
      setWebhookUrl("");
      setWebhookEvents(["task.completed"]);
    } catch {
      toast({ kind: "error", title: "Creazione non riuscita" });
    }
  }

  async function handleRemoveWebhook() {
    if (!removeWebhookTarget) return;
    try {
      await removeWebhook.mutateAsync(removeWebhookTarget.id);
      toast({ kind: "info", title: "Webhook rimosso" });
      setRemoveWebhookTarget(null);
    } catch {
      toast({ kind: "error", title: "Rimozione non riuscita" });
    }
  }

  return (
    <PageTransition>
      <SettingsLayout
        title="Integrazioni"
        description="Collega i canali social e gestisci chiavi API e webhook."
      >
        {/* Piattaforme */}
        <Card
          header={
            <>
              <h3 className="flex items-center gap-2 text-base font-semibold text-text-primary">
                <Share2 className="h-4 w-4 text-secondary" aria-hidden="true" />
                Canali social
              </h3>
              <span className="text-xs text-text-muted">
                {(platforms.data ?? []).filter((item) => item.status === "connected").length} collegate
              </span>
            </>
          }
        >
          <PlatformGrid
            platforms={platforms.data ?? []}
            loading={platforms.isLoading}
            connectingId={connectPlatform.isPending ? (connectPlatform.variables ?? null) : null}
            onConnect={(id) => {
              const platform = (platforms.data ?? []).find((item) => item.id === id) ?? null;
              setConnectionTarget(platform);
            }}
            onDisconnect={handleDisconnect}
          />
        </Card>

        {/* Chiavi API */}
        <Card
          header={
            <>
              <h3 className="flex items-center gap-2 text-base font-semibold text-text-primary">
                <KeyRound className="h-4 w-4 text-secondary" aria-hidden="true" />
                Chiavi API
              </h3>
              <Button
                variant="ghost"
                size="sm"
                leftIcon={<Plus className="h-4 w-4" aria-hidden="true" />}
                onClick={() => setKeyModalOpen(true)}
              >
                Crea chiave
              </Button>
            </>
          }
          bodyClassName="p-0"
        >
          {apiKeys.isLoading ? (
            <div className="p-5">
              <Skeleton lines={3} />
            </div>
          ) : (apiKeys.data ?? []).length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={<KeyRound className="h-5 w-5" aria-hidden="true" />}
                title="Nessuna chiave API"
                description="Crea una chiave per integrare i tuoi sistemi."
              />
            </div>
          ) : (
            <ul className="divide-y divide-secondary/10">
              {(apiKeys.data ?? []).map((key) => (
                <li key={key.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-text-primary">{key.name}</p>
                    <p className="font-mono text-xs text-text-secondary">{key.prefix}••••••••</p>
                    <p className="mt-0.5 text-xs text-text-muted">
                      Creata {formatDate(key.createdAt)} · Ultimo uso {formatRelative(key.lastUsedAt)}
                    </p>
                  </div>
                  <Badge variant={key.environment === "live" ? "accent" : "default"}>
                    {key.environment === "live" ? "Live" : "Test"}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Revoca chiave ${key.name}`}
                    onClick={() => setRevokeTarget(key)}
                  >
                    <Trash2 className="h-4 w-4 text-error" aria-hidden="true" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Webhook */}
        <Card
          header={
            <>
              <h3 className="flex items-center gap-2 text-base font-semibold text-text-primary">
                <WebhookIcon className="h-4 w-4 text-secondary" aria-hidden="true" />
                Webhook
              </h3>
              <Button
                variant="ghost"
                size="sm"
                leftIcon={<Plus className="h-4 w-4" aria-hidden="true" />}
                onClick={() => setWebhookModalOpen(true)}
              >
                Aggiungi
              </Button>
            </>
          }
          bodyClassName="p-0"
        >
          {webhooks.isLoading ? (
            <div className="p-5">
              <Skeleton lines={3} />
            </div>
          ) : (webhooks.data ?? []).length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={<WebhookIcon className="h-5 w-5" aria-hidden="true" />}
                title="Nessun webhook"
                description="Ricevi eventi in tempo reale sui tuoi endpoint."
              />
            </div>
          ) : (
            <ul className="divide-y divide-secondary/10">
              {(webhooks.data ?? []).map((hook) => {
                const status = WEBHOOK_STATUS[hook.status];
                return (
                  <li key={hook.id} className="flex flex-wrap items-start gap-4 px-5 py-4">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono text-xs text-text-secondary">{hook.url}</p>
                      <p className="mt-1 flex flex-wrap gap-1">
                        {hook.events.map((eventValue) => (
                          <span
                            key={eventValue}
                            className="rounded-full bg-bg-hover px-2 py-0.5 text-[11px] text-text-secondary"
                          >
                            {webhookEventOptions.find((option) => option.value === eventValue)?.label ??
                              eventValue}
                          </span>
                        ))}
                      </p>
                      <p className="mt-1 text-xs text-text-muted">
                        Creato {formatDate(hook.createdAt)}
                      </p>
                    </div>
                    <Badge variant={status.variant}>{status.label}</Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Rimuovi webhook ${hook.url}`}
                      onClick={() => setRemoveWebhookTarget(hook)}
                    >
                      <Trash2 className="h-4 w-4 text-error" aria-hidden="true" />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </SettingsLayout>

      {/* Connessione piattaforma (riuso del flusso esistente) */}
      <ConnectionModal
        open={Boolean(connectionTarget)}
        onOpenChange={(open) => {
          if (!open) setConnectionTarget(null);
        }}
        platform={connectionTarget}
        onConfirm={handleConfirmConnection}
        onSuccess={(id) => {
          toast({ kind: "success", title: `${platformLabel(id)} collegata` });
          setConnectionTarget(null);
        }}
      />

      {/* Modale creazione chiave */}
      <Modal
        open={keyModalOpen}
        onOpenChange={setKeyModalOpen}
        title="Crea chiave API"
        description="La chiave completa sara' mostrata una sola volta."
        footer={
          <>
            <Button variant="ghost" onClick={() => setKeyModalOpen(false)}>
              Annulla
            </Button>
            <Button type="submit" form="create-key-form" loading={createApiKey.isPending}>
              Crea chiave
            </Button>
          </>
        }
      >
        <form id="create-key-form" onSubmit={handleCreateKey} className="flex flex-col gap-4" noValidate>
          <Input
            label="Nome chiave"
            placeholder="es. Produzione"
            value={keyName}
            error={keyError ?? undefined}
            onChange={(event) => setKeyName(event.target.value)}
            required
          />
          <Select
            label="Ambiente"
            value={keyEnv}
            onChange={(event) => setKeyEnv(event.target.value as ApiKey["environment"])}
            options={ENVIRONMENT_OPTIONS}
          />
        </form>
      </Modal>

      {/* Conferma revoca chiave */}
      <Modal
        open={Boolean(revokeTarget)}
        onOpenChange={(open) => {
          if (!open) setRevokeTarget(null);
        }}
        title="Revocare la chiave?"
        description="Le integrazioni che la usano smetteranno di funzionare immediatamente."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRevokeTarget(null)}>
              Annulla
            </Button>
            <Button variant="danger" loading={revokeApiKey.isPending} onClick={handleRevokeKey}>
              Revoca chiave
            </Button>
          </>
        }
      >
        <p className="text-sm text-text-secondary">
          Chiave: <span className="font-medium text-text-primary">{revokeTarget?.name}</span>
        </p>
      </Modal>

      {/* Modale creazione webhook */}
      <Modal
        open={webhookModalOpen}
        onOpenChange={setWebhookModalOpen}
        title="Aggiungi webhook"
        description="Aethersy inviera' una richiesta POST firmata a ogni evento attivato."
        footer={
          <>
            <Button variant="ghost" onClick={() => setWebhookModalOpen(false)}>
              Annulla
            </Button>
            <Button type="submit" form="create-webhook-form" loading={createWebhook.isPending}>
              Aggiungi webhook
            </Button>
          </>
        }
      >
        <form id="create-webhook-form" onSubmit={handleCreateWebhook} className="flex flex-col gap-4" noValidate>
          <Input
            label="URL di destinazione"
            type="url"
            placeholder="https://tuo-dominio.it/webhook"
            value={webhookUrl}
            error={webhookError ?? undefined}
            onChange={(event) => setWebhookUrl(event.target.value)}
            required
          />
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium text-text-secondary">Eventi</legend>
            {webhookEventOptions.map((option) => (
              <label key={option.value} className="flex items-center gap-2.5 text-sm text-text-primary">
                <input
                  type="checkbox"
                  checked={webhookEvents.includes(option.value)}
                  onChange={() => toggleWebhookEvent(option.value)}
                  className="h-4 w-4 rounded border-secondary/40 bg-primary/60 text-secondary focus:ring-secondary"
                />
                {option.label}
              </label>
            ))}
          </fieldset>
        </form>
      </Modal>

      {/* Conferma rimozione webhook */}
      <Modal
        open={Boolean(removeWebhookTarget)}
        onOpenChange={(open) => {
          if (!open) setRemoveWebhookTarget(null);
        }}
        title="Rimuovere il webhook?"
        description="L'endpoint non ricevera' piu' eventi."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRemoveWebhookTarget(null)}>
              Annulla
            </Button>
            <Button variant="danger" loading={removeWebhook.isPending} onClick={handleRemoveWebhook}>
              Rimuovi webhook
            </Button>
          </>
        }
      >
        <p className="break-all font-mono text-xs text-text-secondary">{removeWebhookTarget?.url}</p>
      </Modal>
    </PageTransition>
  );
}
