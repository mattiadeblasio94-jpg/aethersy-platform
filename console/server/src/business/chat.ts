import { withTx } from "../metering/db.js";

// Repository delle conversazioni (P1.3): il canale centrale in cui l'utente
// scrive in linguaggio naturale. La persistenza vive nello schema `business`
// (tabelle `conversation` / `message`), isolata per tenant.
//
// Qui solo I/O: la logica di orchestrazione (decidere se rispondere o accodare
// lavoro agli specialisti) sta in `agent/engine.ts`, cosi' il repository resta
// testabile senza rete.

export type MessageRole = "user" | "agent" | "system";

export interface ConversationRow {
  id: string;
  tenant_id: string;
  title: string;
  kind: "chat" | "run";
  meta: unknown;
  created_at: Date;
  updated_at: Date;
}

export interface MessageRow {
  id: string;
  conversation_id: string;
  tenant_id: string;
  role: MessageRole;
  droid: string;
  content: string;
  credits: number;
  meta: unknown;
  created_at: Date;
}

export async function createConversation(
  tenantId: string,
  title = "Nuova conversazione",
  kind: "chat" | "run" = "chat",
): Promise<ConversationRow> {
  const { rows } = await withTx((client) =>
    client.query<ConversationRow>(
      `INSERT INTO business.conversation (tenant_id, title, kind)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [tenantId, title.slice(0, 200) || "Nuova conversazione", kind],
    ),
  );
  return rows[0];
}

export async function getConversation(
  tenantId: string,
  id: string,
): Promise<ConversationRow | null> {
  const { rows } = await withTx((client) =>
    client.query<ConversationRow>(
      `SELECT * FROM business.conversation WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    ),
  );
  return rows[0] ?? null;
}

/** Ritorna la conversazione esistente (se del tenant) o ne crea una nuova. */
export async function ensureConversation(
  tenantId: string,
  id?: string | null,
  title?: string,
): Promise<ConversationRow> {
  if (id) {
    const existing = await getConversation(tenantId, id);
    if (existing) return existing;
  }
  return createConversation(tenantId, title ?? "Nuova conversazione");
}

export async function listConversations(
  tenantId: string,
  limit = 50,
): Promise<ConversationRow[]> {
  const n = Math.min(Math.max(limit, 1), 200);
  const { rows } = await withTx((client) =>
    client.query<ConversationRow>(
      `SELECT * FROM business.conversation
        WHERE tenant_id = $1
        ORDER BY updated_at DESC
        LIMIT $2`,
      [tenantId, n],
    ),
  );
  return rows;
}

export async function renameConversation(
  tenantId: string,
  id: string,
  title: string,
): Promise<ConversationRow | null> {
  const { rows } = await withTx((client) =>
    client.query<ConversationRow>(
      `UPDATE business.conversation SET title = $3, updated_at = now()
        WHERE id = $1 AND tenant_id = $2
       RETURNING *`,
      [id, tenantId, title.slice(0, 200)],
    ),
  );
  return rows[0] ?? null;
}

export async function touchConversation(tenantId: string, id: string): Promise<void> {
  await withTx((client) =>
    client.query(
      `UPDATE business.conversation SET updated_at = now() WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    ),
  );
}

export interface AppendMessageInput {
  tenantId: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  droid?: string;
  credits?: number;
  meta?: unknown;
}

export async function appendMessage(input: AppendMessageInput): Promise<MessageRow> {
  return withTx(async (client) => {
    const { rows } = await client.query<MessageRow>(
      `INSERT INTO business.message
         (conversation_id, tenant_id, role, droid, content, credits, meta)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
       RETURNING *`,
      [
        input.conversationId,
        input.tenantId,
        input.role,
        input.droid ?? "",
        input.content ?? "",
        input.credits ?? 0,
        JSON.stringify(input.meta ?? {}),
      ],
    );
    await client.query(
      `UPDATE business.conversation SET updated_at = now() WHERE id = $1 AND tenant_id = $2`,
      [input.conversationId, input.tenantId],
    );
    return rows[0];
  });
}

export async function listMessages(
  tenantId: string,
  conversationId: string,
  limit = 200,
): Promise<MessageRow[]> {
  const n = Math.min(Math.max(limit, 1), 500);
  const { rows } = await withTx((client) =>
    client.query<MessageRow>(
      `SELECT * FROM business.message
        WHERE conversation_id = $1 AND tenant_id = $2
        ORDER BY created_at ASC
        LIMIT $3`,
      [conversationId, tenantId, n],
    ),
  );
  return rows;
}

/** Ultimi N messaggi (cronologico) per costruire il contesto della chat. */
export async function recentMessages(
  tenantId: string,
  conversationId: string,
  limit = 12,
): Promise<MessageRow[]> {
  const { rows } = await withTx((client) =>
    client.query<MessageRow>(
      `SELECT * FROM (
         SELECT * FROM business.message
          WHERE conversation_id = $1 AND tenant_id = $2
          ORDER BY created_at DESC
          LIMIT $3
       ) m ORDER BY created_at ASC`,
      [conversationId, tenantId, limit],
    ),
  );
  return rows;
}

/**
 * Contesto aziendale compatto (P1.3): obiettivi attivi, memoria fissa/recente e
 * prodotti attivi. L'orchestratore legge da qui invece di indovinare chi sia il
 * cliente e cosa venda. Testo breve: entra nel system prompt.
 */
export async function businessContext(tenantId: string): Promise<string> {
  return withTx(async (client) => {
    const goals = await client.query<{ title: string; status: string; metric: string }>(
      `SELECT title, status, metric FROM business.goal
        WHERE tenant_id = $1 AND status = 'active'
        ORDER BY priority ASC, created_at DESC LIMIT 8`,
      [tenantId],
    );
    const products = await client.query<{ name: string; kind: string; price_cents: string; currency: string }>(
      `SELECT name, kind, price_cents, currency FROM business.product
        WHERE tenant_id = $1 AND status = 'active'
        ORDER BY created_at DESC LIMIT 8`,
      [tenantId],
    );
    const memory = await client.query<{ kind: string; title: string; content: string }>(
      `SELECT kind, title, content FROM business.memory
        WHERE tenant_id = $1
        ORDER BY pinned DESC, created_at DESC LIMIT 12`,
      [tenantId],
    );

    const parts: string[] = [];
    if (goals.rows.length) {
      parts.push(
        "OBIETTIVI ATTIVI:\n" +
          goals.rows.map((g) => `- ${g.title}${g.metric ? ` (metrica: ${g.metric})` : ""}`).join("\n"),
      );
    }
    if (products.rows.length) {
      parts.push(
        "OFFERTA ATTIVA:\n" +
          products.rows
            .map((p) => `- ${p.name} [${p.kind}] ${(Number(p.price_cents) / 100).toFixed(2)} ${p.currency}`)
            .join("\n"),
      );
    }
    if (memory.rows.length) {
      parts.push(
        "MEMORIA:\n" +
          memory.rows
            .map((m) => `- (${m.kind}) ${m.title ? `${m.title}: ` : ""}${m.content}`.slice(0, 240))
            .join("\n"),
      );
    }
    return parts.join("\n\n");
  });
}
