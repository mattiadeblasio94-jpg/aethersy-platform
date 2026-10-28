import { config } from "../config.js";
import { decryptSecret, SecretsKeyError } from "./secrets.js";
import { findActiveIntegrationCredential, type LeadRow, type PipelineRunRow } from "./repo.js";

// Canale outbound minimo (P0.6): inoltra gli eventi della pipeline al mondo
// esterno. Oggi l'unico canale implementato e' Slack (Incoming Webhook), scelto
// perche' gia' presente nello stack (Fase 6: `SLACK_WEBHOOK_URL` in `.env`).
//
// Ordine di risoluzione del webhook:
//   1. credenziale del tenant `pipeline.integration_credential`
//      (provider `slack`, kind `webhook`) -> segreto decifrato a runtime;
//   2. fallback di stack `SLACK_WEBHOOK_URL` (env del servizio `console`).
// Se nessuno dei due esiste, la notifica e' un no-op silenzioso: il pilota
// funziona anche senza canale configurato, senza errori a video.
//
// Le notifiche NON bloccano il percorso principale: ogni errore di rete viene
// loggato e assorbito dal chiamante (fire-and-forget).

export interface NotifyResult {
  sent: boolean;
  /** Canale effettivamente usato, o `null` se nessun canale configurato. */
  channel: "tenant" | "env" | null;
  error?: string;
}

const SLACK_PROVIDER = "slack";
const REQUEST_TIMEOUT_MS = 5_000;

/** Vero se esiste almeno un canale configurato (tenant o fallback di stack). */
export function hasOutboundChannel(): boolean {
  return Boolean(config.slackWebhookUrl);
}

/**
 * Risolve l'URL del webhook Slack: prima la credenziale del tenant, poi il
 * fallback di stack. La credenziale del tenant ha priorita' cosi' un cliente
 * puo' ricevere i propri lead sul proprio canale.
 */
async function resolveSlackWebhook(tenantId: string): Promise<{ url: string; channel: "tenant" | "env" } | null> {
  try {
    const cred = await findActiveIntegrationCredential(tenantId, SLACK_PROVIDER);
    if (cred) {
      const url = decryptSecret(cred.secret_enc).trim();
      if (url) return { url, channel: "tenant" };
    }
  } catch (err) {
    // Chiave assente o blob corrotto: si prova comunque il fallback di stack.
    if (!(err instanceof SecretsKeyError)) {
      // eslint-disable-next-line no-console
      console.error(`[notify] credenziale slack del tenant illeggibile: ${(err as Error).message}`);
    }
  }
  if (config.slackWebhookUrl) return { url: config.slackWebhookUrl, channel: "env" };
  return null;
}

/** Invia un payload a un webhook Slack con timeout e nessun retry. */
async function postSlack(url: string, text: string): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`Slack ha risposto ${res.status}`);
    }
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Invia un testo libero al canale del tenant (o al fallback di stack).
 * Non lancia mai: ritorna l'esito cosi' il chiamante decide se loggare.
 */
export async function notifyText(tenantId: string, text: string): Promise<NotifyResult> {
  const target = await resolveSlackWebhook(tenantId);
  if (!target) return { sent: false, channel: null };
  try {
    await postSlack(target.url, text);
    return { sent: true, channel: target.channel };
  } catch (err) {
    return { sent: false, channel: target.channel, error: (err as Error).message };
  }
}

/** Riga di testo compatta e non ambigua per un lead. */
export function leadNotificationText(lead: LeadRow): string {
  const who = lead.name || lead.email || lead.phone || "anonimo";
  const contact = [lead.email, lead.phone].filter(Boolean).join(" · ");
  const parts = [
    `:inbox_tray: *Nuovo lead* (${lead.source}) — ${who}`,
    contact ? `Contatto: ${contact}` : null,
    lead.message ? `Messaggio: ${lead.message}` : null,
    `Stato: ${lead.status}`,
  ].filter(Boolean);
  return parts.join("\n");
}

/** Notifica la creazione di un lead (best-effort, mai bloccante). */
export async function notifyLeadCreated(tenantId: string, lead: LeadRow): Promise<NotifyResult> {
  return notifyText(tenantId, leadNotificationText(lead));
}

/** Notifica la consegna di un run approvato (best-effort, mai bloccante). */
export async function notifyRunDelivered(
  tenantId: string,
  run: PipelineRunRow,
): Promise<NotifyResult> {
  const text = [
    `:package: *Run consegnato* — ${run.title || run.stage}`,
    `Stadio: ${run.stage}`,
    run.approved_by ? `Approvato da: ${run.approved_by}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  return notifyText(tenantId, text);
}
