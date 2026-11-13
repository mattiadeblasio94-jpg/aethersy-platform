import type { FastifyInstance } from "fastify";
import { requireMeteredTenant } from "../platform/guard.js";
import {
  GOAL_STATUSES,
  GOAL_STATUS_LABELS,
  MEMORY_KINDS,
  MEMORY_KIND_LABELS,
  PRODUCT_KINDS,
  PRODUCT_KIND_LABELS,
  PRODUCT_STATUSES,
  PRODUCT_STATUS_LABELS,
} from "./catalog.js";

// Rotte del substrato aziendale (P1.1), montate sotto /api/platform/* accanto
// alle rotte "Business Pulse". Riguardano obiettivi, memoria e catalogo
// prodotti/servizi del tenant.
//
//   GET    /api/platform/business/catalog       -> dizionari (stati, tipi)
//   GET    /api/platform/business/summary       -> conteggi aggregati
//   GET    /api/platform/goals                  -> elenco obiettivi
//   POST   /api/platform/goals                  -> crea obiettivo
//   PATCH  /api/platform/goals/:id              -> aggiorna obiettivo
//   DELETE /api/platform/goals/:id              -> elimina obiettivo
//   GET    /api/platform/memory                 -> elenco memoria (filtri)
//   POST   /api/platform/memory                 -> aggiunge voce
//   PATCH  /api/platform/memory/:id             -> aggiorna voce
//   DELETE /api/platform/memory/:id             -> elimina voce
//   GET    /api/platform/products               -> elenco prodotti/servizi
//   POST   /api/platform/products               -> crea prodotto/servizio
//   PATCH  /api/platform/products/:id           -> aggiorna
//   DELETE /api/platform/products/:id           -> elimina
//
// Tutte richiedono il metering attivo (gli schemi vivono li').

export async function registerBusinessRoutes(app: FastifyInstance): Promise<void> {
  // ---------------------------------------------------------- catalogo ----
  app.get("/api/platform/business/catalog", async (request, reply) => {
    const tenant = await requireMeteredTenant(request, reply);
    if (!tenant) return;
    return {
      goalStatuses: GOAL_STATUSES.map((s) => ({ id: s, label: GOAL_STATUS_LABELS[s] })),
      memoryKinds: MEMORY_KINDS.map((k) => ({ id: k, label: MEMORY_KIND_LABELS[k] })),
      productKinds: PRODUCT_KINDS.map((k) => ({ id: k, label: PRODUCT_KIND_LABELS[k] })),
      productStatuses: PRODUCT_STATUSES.map((s) => ({ id: s, label: PRODUCT_STATUS_LABELS[s] })),
    };
  });

  app.get("/api/platform/business/summary", async (request, reply) => {
    const tenant = await requireMeteredTenant(request, reply);
    if (!tenant) return;
    const { businessSummary } = await import("./repo.js");
    return businessSummary(tenant.tenantId);
  });

  // ------------------------------------------------------------- goals ----
  app.get("/api/platform/goals", async (request, reply) => {
    const tenant = await requireMeteredTenant(request, reply);
    if (!tenant) return;
    const { status, limit } = request.query as { status?: string; limit?: string };
    const { listGoals } = await import("./repo.js");
    return listGoals(tenant.tenantId, { status, limit: limit ? Number(limit) : undefined });
  });

  app.post("/api/platform/goals", async (request, reply) => {
    const tenant = await requireMeteredTenant(request, reply);
    if (!tenant) return;
    const body = (request.body ?? {}) as {
      title?: string;
      description?: string;
      status?: string;
      priority?: number;
      metric?: string;
      targetDate?: string | null;
      meta?: unknown;
    };
    if (!body.title?.trim()) {
      return reply.code(400).send({ code: "BAD_REQUEST", message: "title richiesto" });
    }
    const { createGoal } = await import("./repo.js");
    try {
      const created = await createGoal({
        tenantId: tenant.tenantId,
        title: body.title,
        description: body.description,
        status: body.status as never,
        priority: body.priority,
        metric: body.metric,
        targetDate: body.targetDate ?? null,
        meta: body.meta,
      });
      return reply.code(201).send(created);
    } catch (err) {
      return reply.code(400).send({ code: "BAD_REQUEST", message: (err as Error).message });
    }
  });

  app.patch("/api/platform/goals/:id", async (request, reply) => {
    const tenant = await requireMeteredTenant(request, reply);
    if (!tenant) return;
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as {
      title?: string;
      description?: string;
      status?: string;
      priority?: number;
      metric?: string;
      targetDate?: string | null;
      meta?: unknown;
    };
    const { updateGoal } = await import("./repo.js");
    try {
      const updated = await updateGoal(tenant.tenantId, id, {
        title: body.title,
        description: body.description,
        status: body.status as never,
        priority: body.priority,
        metric: body.metric,
        targetDate: body.targetDate,
        meta: body.meta,
      });
      if (!updated) return reply.code(404).send({ code: "NOT_FOUND", message: "Obiettivo inesistente" });
      return updated;
    } catch (err) {
      return reply.code(400).send({ code: "BAD_REQUEST", message: (err as Error).message });
    }
  });

  app.delete("/api/platform/goals/:id", async (request, reply) => {
    const tenant = await requireMeteredTenant(request, reply);
    if (!tenant) return;
    const { id } = request.params as { id: string };
    const { deleteGoal } = await import("./repo.js");
    const ok = await deleteGoal(tenant.tenantId, id);
    if (!ok) return reply.code(404).send({ code: "NOT_FOUND", message: "Obiettivo inesistente" });
    return { ok: true };
  });

  // ------------------------------------------------------------ memory ----
  app.get("/api/platform/memory", async (request, reply) => {
    const tenant = await requireMeteredTenant(request, reply);
    if (!tenant) return;
    const { kind, tag, pinned, search, limit } = request.query as {
      kind?: string;
      tag?: string;
      pinned?: string;
      search?: string;
      limit?: string;
    };
    const { listMemory } = await import("./repo.js");
    return listMemory(tenant.tenantId, {
      kind,
      tag,
      pinned: pinned === undefined ? undefined : pinned === "true",
      search,
      limit: limit ? Number(limit) : undefined,
    });
  });

  app.post("/api/platform/memory", async (request, reply) => {
    const tenant = await requireMeteredTenant(request, reply);
    if (!tenant) return;
    const body = (request.body ?? {}) as {
      kind?: string;
      title?: string;
      content?: string;
      source?: string;
      tags?: string[];
      pinned?: boolean;
      meta?: unknown;
      path?: string;
    };
    if (!body.content?.trim()) {
      return reply.code(400).send({ code: "BAD_REQUEST", message: "content richiesto" });
    }
    const { createMemory } = await import("./repo.js");
    try {
      const created = await createMemory({
        tenantId: tenant.tenantId,
        kind: body.kind as never,
        title: body.title,
        content: body.content,
        source: body.source,
        tags: body.tags,
        pinned: body.pinned,
        meta: body.meta,
        path: body.path,
      });
      return reply.code(201).send(created);
    } catch (err) {
      return reply.code(400).send({ code: "BAD_REQUEST", message: (err as Error).message });
    }
  });

  // Grafo della memoria (stile Obsidian): nodi = file, archi = wiki link.
  app.get("/api/platform/memory/graph", async (request, reply) => {
    const tenant = await requireMeteredTenant(request, reply);
    if (!tenant) return;
    const { memoryGraph } = await import("./repo.js");
    return memoryGraph(tenant.tenantId);
  });

  // Export del vault: file markdown pronti da leggere/copiare altrove.
  app.get("/api/platform/memory/vault", async (request, reply) => {
    const tenant = await requireMeteredTenant(request, reply);
    if (!tenant) return;
    const { memoryVault } = await import("./repo.js");
    const files = await memoryVault(tenant.tenantId);
    return { tenantId: tenant.tenantId, count: files.length, files };
  });

  app.patch("/api/platform/memory/:id", async (request, reply) => {
    const tenant = await requireMeteredTenant(request, reply);
    if (!tenant) return;
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as {
      kind?: string;
      title?: string;
      content?: string;
      source?: string;
      tags?: string[];
      pinned?: boolean;
      meta?: unknown;
      path?: string;
    };
    const { updateMemory } = await import("./repo.js");
    try {
      const updated = await updateMemory(tenant.tenantId, id, {
        kind: body.kind as never,
        title: body.title,
        content: body.content,
        source: body.source,
        tags: body.tags,
        pinned: body.pinned,
        meta: body.meta,
        path: body.path,
      });
      if (!updated) return reply.code(404).send({ code: "NOT_FOUND", message: "Voce inesistente" });
      return updated;
    } catch (err) {
      return reply.code(400).send({ code: "BAD_REQUEST", message: (err as Error).message });
    }
  });

  app.delete("/api/platform/memory/:id", async (request, reply) => {
    const tenant = await requireMeteredTenant(request, reply);
    if (!tenant) return;
    const { id } = request.params as { id: string };
    const { deleteMemory } = await import("./repo.js");
    const ok = await deleteMemory(tenant.tenantId, id);
    if (!ok) return reply.code(404).send({ code: "NOT_FOUND", message: "Voce inesistente" });
    return { ok: true };
  });

  // ---------------------------------------------------------- products ----
  app.get("/api/platform/products", async (request, reply) => {
    const tenant = await requireMeteredTenant(request, reply);
    if (!tenant) return;
    const { status, kind, limit } = request.query as {
      status?: string;
      kind?: string;
      limit?: string;
    };
    const { listProducts } = await import("./repo.js");
    return listProducts(tenant.tenantId, {
      status,
      kind,
      limit: limit ? Number(limit) : undefined,
    });
  });

  app.post("/api/platform/products", async (request, reply) => {
    const tenant = await requireMeteredTenant(request, reply);
    if (!tenant) return;
    const body = (request.body ?? {}) as {
      kind?: string;
      name?: string;
      sku?: string;
      description?: string;
      priceCents?: number;
      currency?: string;
      status?: string;
      meta?: unknown;
    };
    if (!body.name?.trim()) {
      return reply.code(400).send({ code: "BAD_REQUEST", message: "name richiesto" });
    }
    const { createProduct } = await import("./repo.js");
    try {
      const created = await createProduct({
        tenantId: tenant.tenantId,
        kind: body.kind as never,
        name: body.name,
        sku: body.sku,
        description: body.description,
        priceCents: body.priceCents,
        currency: body.currency,
        status: body.status as never,
        meta: body.meta,
      });
      return reply.code(201).send(created);
    } catch (err) {
      return reply.code(400).send({ code: "BAD_REQUEST", message: (err as Error).message });
    }
  });

  app.patch("/api/platform/products/:id", async (request, reply) => {
    const tenant = await requireMeteredTenant(request, reply);
    if (!tenant) return;
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as {
      kind?: string;
      name?: string;
      sku?: string;
      description?: string;
      priceCents?: number;
      currency?: string;
      status?: string;
      meta?: unknown;
    };
    const { updateProduct } = await import("./repo.js");
    try {
      const updated = await updateProduct(tenant.tenantId, id, {
        kind: body.kind as never,
        name: body.name,
        sku: body.sku,
        description: body.description,
        priceCents: body.priceCents,
        currency: body.currency,
        status: body.status as never,
        meta: body.meta,
      });
      if (!updated) return reply.code(404).send({ code: "NOT_FOUND", message: "Prodotto inesistente" });
      return updated;
    } catch (err) {
      return reply.code(400).send({ code: "BAD_REQUEST", message: (err as Error).message });
    }
  });

  app.delete("/api/platform/products/:id", async (request, reply) => {
    const tenant = await requireMeteredTenant(request, reply);
    if (!tenant) return;
    const { id } = request.params as { id: string };
    const { deleteProduct } = await import("./repo.js");
    const ok = await deleteProduct(tenant.tenantId, id);
    if (!ok) return reply.code(404).send({ code: "NOT_FOUND", message: "Prodotto inesistente" });
    return { ok: true };
  });

  // -------------------------------------------------- Chat centrale (P1.3) ----
  // Il canale in linguaggio naturale: l'utente scrive, l'orchestratore risponde
  // o apre uno stadio di pipeline (gli agenti lavorano). Vedi agent/engine.ts.

  app.get("/api/platform/chat/conversations", async (request, reply) => {
    const tenant = await requireMeteredTenant(request, reply);
    if (!tenant) return;
    const { listConversations } = await import("./chat.js");
    return { conversations: await listConversations(tenant.tenantId) };
  });

  app.post("/api/platform/chat/conversations", async (request, reply) => {
    const tenant = await requireMeteredTenant(request, reply);
    if (!tenant) return;
    const body = (request.body ?? {}) as { title?: string };
    const { createConversation } = await import("./chat.js");
    return reply.code(201).send(await createConversation(tenant.tenantId, body.title));
  });

  app.get("/api/platform/chat/conversations/:id", async (request, reply) => {
    const tenant = await requireMeteredTenant(request, reply);
    if (!tenant) return;
    const { id } = request.params as { id: string };
    const { getConversation, listMessages } = await import("./chat.js");
    const conversation = await getConversation(tenant.tenantId, id);
    if (!conversation) return reply.code(404).send({ code: "NOT_FOUND", message: "Conversazione inesistente" });
    return { conversation, messages: await listMessages(tenant.tenantId, id) };
  });

  app.post("/api/platform/chat", async (request, reply) => {
    const tenant = await requireMeteredTenant(request, reply);
    if (!tenant) return;
    const body = (request.body ?? {}) as {
      text?: string;
      conversationId?: string | null;
      autoStartRun?: boolean;
    };
    if (!body.text?.trim()) {
      return reply.code(400).send({ code: "BAD_REQUEST", message: "text richiesto" });
    }
    const { handleTurn } = await import("../agent/engine.js");
    try {
      return await handleTurn(tenant, {
        text: body.text,
        conversationId: body.conversationId ?? null,
        autoStartRun: body.autoStartRun,
      });
    } catch (err) {
      return reply.code(502).send({ code: "AGENT_ERROR", message: (err as Error).message });
    }
  });
}
