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
 *
 * La credenziale del tenant puo' essere di due forme:
 *   - un pacchetto OAuth Slack (JSON con `access_token` e magari
 *     `incoming_webhook`): non e' un URL, non puo' essere usato come webhook;
 *     si usa l'`incoming_webhook` se presente, altrimenti si ricade sul canale
 *     di stack;
 *   - un URL di webhook (Incoming Webhook): viene usato direttamente.
 *
 * Prima del fix il pacchetto OAuth veniva passato a `fetch()` come URL e la
 * notifica falliva con "Failed to parse URL from {...}".
 */
async function resolveSlackWebhook(tenantId: string): Promise<{ url: string; channel: "tenant" | "env" } | null> {
  try {
    const cred = await findActiveIntegrationCredential(tenantId, SLACK_PROVIDER);
    if (cred) {
      const raw = decryptSecret(cred.secret_enc).trim();
      if (raw) {
        // Pacchetto JSON (OAuth): si cerca l'URL del webhook dentro.
        if (raw.startsWith("{")) {
          try {
            const bundle = JSON.parse(raw) as {
              incoming_webhook?: string | { url?: string };
              extra?: { incoming_webhook?: string | { url?: string } };
            };
            const hook = bundle.incoming_webhook ?? bundle.extra?.incoming_webhook;
            const url = typeof hook === "string" ? hook : hook?.url;
            if (url && /^https?:\/\//i.test(url)) return { url, channel: "tenant" };
          } catch {
            // JSON non valido: si prosegue con il fallback di stack.
          }
        } else if (/^https?:\/\//i.test(raw)) {
          return { url: raw, channel: "tenant" };
        }
      }
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
export async function postSlack(url: string, text: string): Promise<void> {
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

/**
 * Webhook in uscita generico (firma HMAC-SHA256).
 *
 * Il tenant registra un endpoint (CRM, automazione, Zapier, n8n): ogni evento
 * della pipeline viene consegnato come POST JSON con le intestazioni
 * `X-Aethersy-Event` e `X-Aethersy-Signature` (HMAC-SHA256 del corpo con il
 * segreto condiviso). Il segreto non viene mai esposto al client.
 */
const GENERIC_PROVIDER = "webhook";

async function resolveGenericWebhooks(
  tenantId: string,
): Promise<{ id: string; url: string; secret: string }[]> {
  const { listIntegrationCredentials, getIntegrationCredential } = await import("./repo.js");
  const creds = await listIntegrationCredentials(tenantId);
  const out: { id: string; url: string; secret: string }[] = [];
  for (const cred of creds) {
    if (cred.provider !== GENERIC_PROVIDER || cred.status !== "active") continue;
    try {
      const full = await getIntegrationCredential(tenantId, cred.id);
      if (!full) continue;
      const raw = decryptSecret(full.secret_enc).trim();
      if (!raw) continue;
      // Il segreto cifrato del webhook e' un JSON {"url", "signingSecret"}.
      let url = raw;
      let secret = "";
      if (raw.startsWith("{")) {
        try {
          const parsed = JSON.parse(raw) as { url?: string; signingSecret?: string };
          url = (parsed.url ?? "").trim();
          secret = parsed.signingSecret ?? "";
        } catch {
          continue;
        }
      }
      if (!url) continue;
      out.push({ id: cred.id, url, secret });
    } catch {
      // Segreto illeggibile: il canale viene scartato senza fermare gli altri.
    }
  }
  return out;
}

async function postSigned(
  url: string,
  secret: string,
  event: string,
  payload: unknown,
): Promise<void> {
  const body = JSON.stringify({ event, payload, sent_at: new Date().toISOString() });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Aethersy-Event": event,
    };
    if (secret) {
      const key = await import("node:crypto");
      const signature = key.createHmac("sha256", secret).update(body).digest("hex");
      headers["X-Aethersy-Signature"] = `sha256=${signature}`;
    }
    const res = await fetch(url, { method: "POST", headers, body, signal: controller.signal });
    if (!res.ok) throw new Error(`webhook ha risposto ${res.status}`);
  } finally {
    clearTimeout(timer);
  }
}

/** Consegna un evento a tutti i webhook in uscita del tenant (best-effort). */
export async function notifyWebhookEvent(
  tenantId: string,
  event: string,
  payload: unknown,
): Promise<NotifyResult> {
  const targets = await resolveGenericWebhooks(tenantId);
  if (targets.length === 0) return { sent: false, channel: null };
  let sent = false;
  let lastError: string | undefined;
  for (const target of targets) {
    try {
      await postSigned(target.url, target.secret, event, payload);
      sent = true;
    } catch (error) {
      lastError = (error as Error).message;
    }
  }
  return { sent, channel: sent ? "tenant" : "tenant", error: lastError };
}

/** Host del webhook, senza percorso ne' query: dato mostrabile in UI. */
export function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}

/** Invia un evento di prova a un webhook in uscita (secret cifrato JSON). */
export async function postWebhookTest(encryptedPayload: string, message: string): Promise<void> {
  const raw = decryptSecret(encryptedPayload).trim();
  let url = raw;
  let secret = "";
  if (raw.startsWith("{")) {
    const parsed = JSON.parse(raw) as { url?: string; signingSecret?: string };
    url = (parsed.url ?? "").trim();
    secret = parsed.signingSecret ?? "";
  }
  if (!url) throw new Error("URL del webhook mancante");
  await postSigned(url, secret, "test", { message, sent_at: new Date().toISOString() });
}

/**
 * Canale di stack per le notizie di piattaforma (deploy): usa il webhook
 * Slack dell'ambiente, cosi' l'operatore riceve una sola notifica anche se
 * i tenant hanno canali propri.
 */
export async function notifyStackChannel(text: string): Promise<NotifyResult> {
  if (!config.slackWebhookUrl) return { sent: false, channel: null };
  try {
    await postSlack(config.slackWebhookUrl, text);
    return { sent: true, channel: "env" };
  } catch (err) {
    return { sent: false, channel: "env", error: (err as Error).message };
  }
}
