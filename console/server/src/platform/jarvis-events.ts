// =============================================================================
// Jarvis — eventi proattivi (Fase 35).
//
// Jarvis non aspetta che l'utente gli chieda qualcosa: il watcher sul VPS
// dedicato osserva la piattaforma e invia qui gli eventi che meritano
// attenzione. Il BFF li persiste (business.jarvis_event) e li trasmette in
// streaming alle pagine /jarvis aperte (SSE), che le annunciano anche a voce.
//
// Bus in-process: la console gira in un solo processo Fastify, quindi un
// EventEmitter basta. Se la console venisse replicata, il bus andrebbe
// sostituito da Redis (il client Redis e' gia' configurato).
// =============================================================================

import { EventEmitter } from "node:events";
import { db, meteringActive } from "../metering/db.js";
import { withTx } from "../metering/db.js";

export type JarvisEventKind = "notice" | "alert" | "task" | "insight" | "system";
export type JarvisEventSeverity = "info" | "warning" | "critical";

export interface JarvisEventInput {
  tenantId: string;
  kind?: JarvisEventKind;
  severity?: JarvisEventSeverity;
  title: string;
  message?: string;
  source?: string;
  meta?: Record<string, unknown>;
}

export interface JarvisEvent {
  id: string;
  tenant_id: string;
  kind: JarvisEventKind;
  severity: JarvisEventSeverity;
  title: string;
  message: string;
  source: string;
  meta: Record<string, unknown>;
  created_at: string;
}

const bus = new EventEmitter();
bus.setMaxListeners(0);

/** Canale SSE per tenant: i listener ricevono gli eventi in arrivo. */
export function subscribeJarvisEvents(
  tenantId: string,
  listener: (event: JarvisEvent) => void,
): () => void {
  const channel = `tenant:${tenantId}`;
  const wrapped = (event: JarvisEvent) => listener(event);
  bus.on(channel, wrapped);
  return () => bus.off(channel, wrapped);
}

export async function insertJarvisEvent(input: JarvisEventInput): Promise<JarvisEvent | null> {
  if (!meteringActive()) return null;
  const kind = input.kind ?? "notice";
  const severity = input.severity ?? "info";
  const row = await withTx((client) =>
    client.query<JarvisEvent>(
      `INSERT INTO business.jarvis_event
         (tenant_id, kind, severity, title, message, source, meta)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
       RETURNING *`,
      [
        input.tenantId,
        kind,
        severity,
        input.title,
        input.message ?? "",
        input.source ?? "jarvis",
        JSON.stringify(input.meta ?? {}),
      ],
    ),
  );
  const event = row.rows[0];
  if (!event) return null;
  bus.emit(`tenant:${input.tenantId}`, event);
  return event;
}

export async function listJarvisEvents(
  tenantId: string,
  opts: { limit?: number } = {},
): Promise<JarvisEvent[]> {
  if (!meteringActive()) return [];
  const limit = Math.min(Math.max(opts.limit ?? 30, 1), 100);
  const res = await db().query<JarvisEvent>(
    `SELECT * FROM business.jarvis_event
      WHERE tenant_id = $1
      ORDER BY created_at DESC
      LIMIT $2`,
    [tenantId, limit],
  );
  return res.rows;
}
