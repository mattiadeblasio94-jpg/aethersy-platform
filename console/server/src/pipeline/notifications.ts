// pipeline/notifications.ts — notifiche in-app della piattaforma.
//
// Gli eventi reali (lead, consegne, deploy, errori) vengono scritti in
// `pipeline.notification` e mostrati in piattaforma. Quando il tenant ha un
// canale outbound configurato (Slack o webhook in uscita) la stessa notifica
// viene inoltrata lì: la consegna non blocca mai la scrittura.
//
// `scope = 'platform'` sono notizie di piattaforma (per esempio un deploy) e
// sono visibili a tutti i tenant; `scope = 'tenant'` riguardano un solo
// tenant.

import { withTx } from "../metering/db.js";
import { notifyStackChannel, notifyText, notifyWebhookEvent } from "./notify.js";

export type NotificationScope = "tenant" | "platform";
export type NotificationSeverity = "info" | "success" | "warning" | "critical";

export interface NotificationRow {
  id: string;
  tenant_id: string | null;
  scope: NotificationScope;
  kind: string;
  severity: NotificationSeverity;
  title: string;
  body: string;
  link: string | null;
  meta: unknown;
  read_at: Date | null;
  created_at: Date;
}

export interface CreateNotificationInput {
  tenantId?: string | null;
  scope?: NotificationScope;
  kind: string;
  severity?: NotificationSeverity;
  title: string;
  body?: string;
  link?: string | null;
  meta?: unknown;
}

export async function createNotification(
  input: CreateNotificationInput,
): Promise<NotificationRow> {
  const scope: NotificationScope = input.tenantId ? (input.scope ?? "tenant") : "platform";
  const { rows } = await withTx((client) =>
    client.query<NotificationRow>(
      `INSERT INTO pipeline.notification
         (tenant_id, scope, kind, severity, title, body, link, meta)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
       RETURNING *`,
      [
        input.tenantId ?? null,
        scope,
        input.kind,
        input.severity ?? "info",
        input.title,
        input.body ?? "",
        input.link ?? null,
        JSON.stringify(input.meta ?? {}),
      ],
    ),
  );
  return rows[0];
}

/** Notifiche del tenant: le sue piu' quelle di piattaforma. */
export async function listNotifications(
  tenantId: string,
  limit = 50,
): Promise<NotificationRow[]> {
  const { rows } = await withTx((client) =>
    client.query<NotificationRow>(
      `SELECT * FROM pipeline.notification
        WHERE (tenant_id = $1) OR scope = 'platform'
        ORDER BY created_at DESC
        LIMIT $2`,
      [tenantId, limit],
    ),
  );
  return rows;
}

export async function unreadNotificationCount(tenantId: string): Promise<number> {
  const { rows } = await withTx((client) =>
    client.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM pipeline.notification
        WHERE read_at IS NULL AND ((tenant_id = $1) OR scope = 'platform')`,
      [tenantId],
    ),
  );
  return Number(rows[0]?.count ?? 0);
}

export async function markNotificationRead(
  tenantId: string,
  id: string,
): Promise<boolean> {
  const res = await withTx((client) =>
    client.query(
      `UPDATE pipeline.notification SET read_at = now()
        WHERE id = $1 AND ((tenant_id = $2) OR scope = 'platform') AND read_at IS NULL`,
      [id, tenantId],
    ),
  );
  return (res.rowCount ?? 0) > 0;
}

export async function markAllNotificationsRead(tenantId: string): Promise<number> {
  const res = await withTx((client) =>
    client.query(
      `UPDATE pipeline.notification SET read_at = now()
        WHERE read_at IS NULL AND ((tenant_id = $1) OR scope = 'platform')`,
      [tenantId],
    ),
  );
  return res.rowCount ?? 0;
}

/**
 * Crea la notifica in-app e la inoltra ai canali outbound configurati.
 * La consegna e' best-effort: un canale rotto non blocca l'evento.
 */
export async function publishNotification(
  input: CreateNotificationInput,
): Promise<{ notification: NotificationRow; outbound: { slack: boolean; webhook: boolean } }> {
  const notification = await createNotification(input);
  const slack =
    notification.scope === "platform"
      ? await notifyStackChannel(notificationText(notification)).catch(() => ({
          sent: false,
          channel: null,
        }))
      : await notifyText(input.tenantId as string, notificationText(notification)).catch(() => ({
          sent: false,
          channel: null,
        }));
  // Le notizie di piattaforma raggiungono ogni tenant con un webhook attivo.
  const webhookTargets = input.tenantId ? [input.tenantId] : await platformTenantIds();
  let webhook = false;
  for (const tenantId of webhookTargets) {
    const result = await notifyWebhookEvent(tenantId, notification.kind, {
      id: notification.id,
      severity: notification.severity,
      title: notification.title,
      body: notification.body,
      link: notification.link,
      meta: notification.meta,
    }).catch(() => ({ sent: false, channel: null }));
    if (result.sent) webhook = true;
  }
  return { notification, outbound: { slack: slack.sent, webhook } };
}

/** Riga di testo per Slack. */
export function notificationText(notification: NotificationRow): string {
  const icon =
    notification.severity === "critical"
      ? ":rotating_light:"
      : notification.severity === "warning"
        ? ":warning:"
        : notification.severity === "success"
          ? ":white_check_mark:"
          : ":bell:";
  return [`${icon} *${notification.title}*`, notification.body].filter(Boolean).join("\n");
}

/** Tenant attivi: usati per inoltrare le notizie di piattaforma. */
async function platformTenantIds(): Promise<string[]> {
  const { rows } = await withTx((client) =>
    client.query<{ id: string }>(`SELECT id FROM metering.tenant`),
  );
  return rows.map((row) => row.id);
}

export interface WebhookDeliveryRow {
  id: string;
  tenant_id: string | null;
  event: string;
  signature: string | null;
  payload: unknown;
  received_at: Date;
}

/** Ultime consegne webhook ricevute dal tenant (endpoint di verifica). */
export async function listWebhookDeliveries(
  tenantId: string,
  limit = 20,
): Promise<WebhookDeliveryRow[]> {
  const { rows } = await withTx((client) =>
    client.query<WebhookDeliveryRow>(
      `SELECT * FROM pipeline.webhook_delivery
        WHERE tenant_id = $1
        ORDER BY received_at DESC
        LIMIT $2`,
      [tenantId, limit],
    ),
  );
  return rows;
}
