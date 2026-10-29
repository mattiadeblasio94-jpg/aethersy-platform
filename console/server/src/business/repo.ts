import { withTx } from "../metering/db.js";
import {
  isGoalStatus,
  isGoalPriority,
  isMemoryKind,
  isProductKind,
  isProductStatus,
  type GoalStatus,
  type MemoryKind,
  type ProductKind,
  type ProductStatus,
} from "./catalog.js";

// Repository del substrato aziendale (P1.1): obiettivi, memoria e catalogo
// prodotti/servizi. Ogni funzione e' scoped al tenant (isolamento multi-tenant
// garantito dall'WHERE tenant_id). Nessuna scrittura fuori transazione.

// =============================== GOAL ========================================

export interface GoalRow {
  id: string;
  tenant_id: string;
  title: string;
  description: string;
  status: GoalStatus;
  priority: number;
  metric: string;
  target_date: Date | null;
  meta: unknown;
  achieved_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateGoalInput {
  tenantId: string;
  title: string;
  description?: string;
  status?: GoalStatus;
  priority?: number;
  metric?: string;
  targetDate?: string | null;
  meta?: unknown;
}

export async function createGoal(input: CreateGoalInput): Promise<GoalRow> {
  const status = input.status ?? "active";
  if (!isGoalStatus(status)) throw new Error(`status non valido: ${status}`);
  const priority = input.priority ?? 3;
  if (!isGoalPriority(priority)) throw new Error(`priority fuori range: ${priority}`);
  if (!input.title.trim()) throw new Error("title richiesto");

  const { rows } = await withTx((client) =>
    client.query<GoalRow>(
      `INSERT INTO business.goal
         (tenant_id, title, description, status, priority, metric, target_date, meta)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
       RETURNING *`,
      [
        input.tenantId,
        input.title.trim(),
        input.description ?? "",
        status,
        priority,
        input.metric ?? "",
        input.targetDate ?? null,
        JSON.stringify(input.meta ?? {}),
      ],
    ),
  );
  return rows[0];
}

export async function listGoals(
  tenantId: string,
  opts: { status?: string; limit?: number } = {},
): Promise<GoalRow[]> {
  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 500);
  const { rows } = await withTx((client) =>
    client.query<GoalRow>(
      `SELECT * FROM business.goal
        WHERE tenant_id = $1 AND ($2::text IS NULL OR status = $2)
        ORDER BY priority ASC, created_at DESC
        LIMIT $3`,
      [tenantId, opts.status ?? null, limit],
    ),
  );
  return rows;
}

export async function getGoal(tenantId: string, id: string): Promise<GoalRow | null> {
  const { rows } = await withTx((client) =>
    client.query<GoalRow>(`SELECT * FROM business.goal WHERE id = $1 AND tenant_id = $2`, [
      id,
      tenantId,
    ]),
  );
  return rows[0] ?? null;
}

export async function updateGoal(
  tenantId: string,
  id: string,
  patch: {
    title?: string;
    description?: string;
    status?: GoalStatus;
    priority?: number;
    metric?: string;
    targetDate?: string | null;
    meta?: unknown;
  },
): Promise<GoalRow | null> {
  const current = await getGoal(tenantId, id);
  if (!current) return null;

  if (patch.title !== undefined && !patch.title.trim()) throw new Error("title vuoto");
  if (patch.status !== undefined && !isGoalStatus(patch.status)) throw new Error("status non valido");
  if (patch.priority !== undefined && !isGoalPriority(patch.priority)) {
    throw new Error(`priority fuori range: ${patch.priority}`);
  }

  // Raggiunto/abbandonato: registra (o azzera) il timestamp di chiusura.
  const nextStatus = patch.status ?? current.status;
  let achievedAt: Date | null | undefined;
  if (patch.status !== undefined && patch.status !== current.status) {
    achievedAt = nextStatus === "achieved" ? new Date() : nextStatus === "active" ? null : current.achieved_at;
  }

  const { rows } = await withTx((client) =>
    client.query<GoalRow>(
      `UPDATE business.goal SET
         title       = COALESCE($3, title),
         description = COALESCE($4, description),
         status      = COALESCE($5, status),
         priority    = COALESCE($6, priority),
         metric      = COALESCE($7, metric),
         target_date = $8,
         meta        = COALESCE($9::jsonb, meta),
         achieved_at = $10,
         updated_at  = now()
       WHERE id = $1 AND tenant_id = $2
       RETURNING *`,
      [
        id,
        tenantId,
        patch.title?.trim() ?? null,
        patch.description ?? null,
        patch.status ?? null,
        patch.priority ?? null,
        patch.metric ?? null,
        patch.targetDate === undefined ? current.target_date : patch.targetDate,
        patch.meta === undefined ? null : JSON.stringify(patch.meta),
        achievedAt === undefined ? current.achieved_at : achievedAt,
      ],
    ),
  );
  return rows[0] ?? null;
}

export async function deleteGoal(tenantId: string, id: string): Promise<boolean> {
  const res = await withTx((client) =>
    client.query(`DELETE FROM business.goal WHERE id = $1 AND tenant_id = $2`, [id, tenantId]),
  );
  return (res.rowCount ?? 0) > 0;
}

// =============================== MEMORY ======================================

export interface MemoryRow {
  id: string;
  tenant_id: string;
  kind: MemoryKind;
  title: string;
  content: string;
  source: string;
  tags: string[];
  pinned: boolean;
  meta: unknown;
  created_at: Date;
  updated_at: Date;
}

export interface CreateMemoryInput {
  tenantId: string;
  kind?: MemoryKind;
  title?: string;
  content: string;
  source?: string;
  tags?: string[];
  pinned?: boolean;
  meta?: unknown;
}

export async function createMemory(input: CreateMemoryInput): Promise<MemoryRow> {
  const kind = input.kind ?? "note";
  if (!isMemoryKind(kind)) throw new Error(`kind non valido: ${kind}`);
  if (!input.content.trim()) throw new Error("content richiesto");

  const { rows } = await withTx((client) =>
    client.query<MemoryRow>(
      `INSERT INTO business.memory
         (tenant_id, kind, title, content, source, tags, pinned, meta)
       VALUES ($1, $2, $3, $4, $5, $6::text[], $7, $8::jsonb)
       RETURNING *`,
      [
        input.tenantId,
        kind,
        input.title ?? "",
        input.content.trim(),
        input.source ?? "",
        input.tags ?? [],
        input.pinned ?? false,
        JSON.stringify(input.meta ?? {}),
      ],
    ),
  );
  return rows[0];
}

export async function listMemory(
  tenantId: string,
  opts: { kind?: string; tag?: string; pinned?: boolean; search?: string; limit?: number } = {},
): Promise<MemoryRow[]> {
  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 500);
  const search = opts.search?.trim() ? `%${opts.search.trim()}%` : null;
  const { rows } = await withTx((client) =>
    client.query<MemoryRow>(
      `SELECT * FROM business.memory
        WHERE tenant_id = $1
          AND ($2::text IS NULL OR kind = $2)
          AND ($3::text IS NULL OR tags @> ARRAY[$3]::text[])
          AND ($4::boolean IS NULL OR pinned = $4)
          AND ($5::text IS NULL OR title ILIKE $5 OR content ILIKE $5)
        ORDER BY pinned DESC, created_at DESC
        LIMIT $6`,
      [tenantId, opts.kind ?? null, opts.tag ?? null, opts.pinned ?? null, search, limit],
    ),
  );
  return rows;
}

export async function getMemory(tenantId: string, id: string): Promise<MemoryRow | null> {
  const { rows } = await withTx((client) =>
    client.query<MemoryRow>(`SELECT * FROM business.memory WHERE id = $1 AND tenant_id = $2`, [
      id,
      tenantId,
    ]),
  );
  return rows[0] ?? null;
}

export async function updateMemory(
  tenantId: string,
  id: string,
  patch: {
    kind?: MemoryKind;
    title?: string;
    content?: string;
    source?: string;
    tags?: string[];
    pinned?: boolean;
    meta?: unknown;
  },
): Promise<MemoryRow | null> {
  const current = await getMemory(tenantId, id);
  if (!current) return null;

  if (patch.kind !== undefined && !isMemoryKind(patch.kind)) throw new Error("kind non valido");
  if (patch.content !== undefined && !patch.content.trim()) throw new Error("content vuoto");

  const { rows } = await withTx((client) =>
    client.query<MemoryRow>(
      `UPDATE business.memory SET
         kind    = COALESCE($3, kind),
         title   = COALESCE($4, title),
         content = COALESCE($5, content),
         source  = COALESCE($6, source),
         tags    = COALESCE($7::text[], tags),
         pinned  = COALESCE($8, pinned),
         meta    = COALESCE($9::jsonb, meta),
         updated_at = now()
       WHERE id = $1 AND tenant_id = $2
       RETURNING *`,
      [
        id,
        tenantId,
        patch.kind ?? null,
        patch.title ?? null,
        patch.content?.trim() ?? null,
        patch.source ?? null,
        patch.tags ?? null,
        patch.pinned ?? null,
        patch.meta === undefined ? null : JSON.stringify(patch.meta),
      ],
    ),
  );
  return rows[0] ?? null;
}

export async function deleteMemory(tenantId: string, id: string): Promise<boolean> {
  const res = await withTx((client) =>
    client.query(`DELETE FROM business.memory WHERE id = $1 AND tenant_id = $2`, [id, tenantId]),
  );
  return (res.rowCount ?? 0) > 0;
}

// =============================== PRODUCT =====================================

export interface ProductRow {
  id: string;
  tenant_id: string;
  kind: ProductKind;
  name: string;
  sku: string;
  description: string;
  price_cents: string;
  currency: string;
  status: ProductStatus;
  meta: unknown;
  created_at: Date;
  updated_at: Date;
}

export interface CreateProductInput {
  tenantId: string;
  kind?: ProductKind;
  name: string;
  sku?: string;
  description?: string;
  priceCents?: number;
  currency?: string;
  status?: ProductStatus;
  meta?: unknown;
}

export async function createProduct(input: CreateProductInput): Promise<ProductRow> {
  const kind = input.kind ?? "service";
  if (!isProductKind(kind)) throw new Error(`kind non valido: ${kind}`);
  const status = input.status ?? "draft";
  if (!isProductStatus(status)) throw new Error(`status non valido: ${status}`);
  if (!input.name.trim()) throw new Error("name richiesto");
  const price = input.priceCents ?? 0;
  if (!Number.isInteger(price) || price < 0) throw new Error("priceCents non valido");
  const currency = (input.currency ?? "EUR").toUpperCase();
  if (currency.length !== 3) throw new Error("currency deve essere un codice ISO a 3 lettere");

  const { rows } = await withTx((client) =>
    client.query<ProductRow>(
      `INSERT INTO business.product
         (tenant_id, kind, name, sku, description, price_cents, currency, status, meta)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
       RETURNING *`,
      [
        input.tenantId,
        kind,
        input.name.trim(),
        input.sku ?? "",
        input.description ?? "",
        price,
        currency,
        status,
        JSON.stringify(input.meta ?? {}),
      ],
    ),
  );
  return rows[0];
}

export async function listProducts(
  tenantId: string,
  opts: { status?: string; kind?: string; limit?: number } = {},
): Promise<ProductRow[]> {
  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 500);
  const { rows } = await withTx((client) =>
    client.query<ProductRow>(
      `SELECT * FROM business.product
        WHERE tenant_id = $1
          AND ($2::text IS NULL OR status = $2)
          AND ($3::text IS NULL OR kind = $3)
        ORDER BY name ASC
        LIMIT $4`,
      [tenantId, opts.status ?? null, opts.kind ?? null, limit],
    ),
  );
  return rows;
}

export async function getProduct(tenantId: string, id: string): Promise<ProductRow | null> {
  const { rows } = await withTx((client) =>
    client.query<ProductRow>(`SELECT * FROM business.product WHERE id = $1 AND tenant_id = $2`, [
      id,
      tenantId,
    ]),
  );
  return rows[0] ?? null;
}

export async function updateProduct(
  tenantId: string,
  id: string,
  patch: {
    kind?: ProductKind;
    name?: string;
    sku?: string;
    description?: string;
    priceCents?: number;
    currency?: string;
    status?: ProductStatus;
    meta?: unknown;
  },
): Promise<ProductRow | null> {
  const current = await getProduct(tenantId, id);
  if (!current) return null;

  if (patch.kind !== undefined && !isProductKind(patch.kind)) throw new Error("kind non valido");
  if (patch.status !== undefined && !isProductStatus(patch.status)) throw new Error("status non valido");
  if (patch.name !== undefined && !patch.name.trim()) throw new Error("name vuoto");
  if (patch.priceCents !== undefined && (!Number.isInteger(patch.priceCents) || patch.priceCents < 0)) {
    throw new Error("priceCents non valido");
  }
  const currency = patch.currency?.toUpperCase();
  if (currency !== undefined && currency.length !== 3) {
    throw new Error("currency deve essere un codice ISO a 3 lettere");
  }

  const { rows } = await withTx((client) =>
    client.query<ProductRow>(
      `UPDATE business.product SET
         kind        = COALESCE($3, kind),
         name        = COALESCE($4, name),
         sku         = COALESCE($5, sku),
         description = COALESCE($6, description),
         price_cents = COALESCE($7, price_cents),
         currency    = COALESCE($8, currency),
         status      = COALESCE($9, status),
         meta        = COALESCE($10::jsonb, meta),
         updated_at  = now()
       WHERE id = $1 AND tenant_id = $2
       RETURNING *`,
      [
        id,
        tenantId,
        patch.kind ?? null,
        patch.name?.trim() ?? null,
        patch.sku ?? null,
        patch.description ?? null,
        patch.priceCents ?? null,
        currency ?? null,
        patch.status ?? null,
        patch.meta === undefined ? null : JSON.stringify(patch.meta),
      ],
    ),
  );
  return rows[0] ?? null;
}

export async function deleteProduct(tenantId: string, id: string): Promise<boolean> {
  const res = await withTx((client) =>
    client.query(`DELETE FROM business.product WHERE id = $1 AND tenant_id = $2`, [id, tenantId]),
  );
  return (res.rowCount ?? 0) > 0;
}

// =============================== SUMMARY =====================================

export interface BusinessSummary {
  goals: { total: number; active: number; achieved: number; byStatus: Record<string, number> };
  memory: { total: number; pinned: number; byKind: Record<string, number> };
  products: { total: number; active: number; byStatus: Record<string, number> };
}

function toCountMap(rows: { key: string; count: string }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) out[r.key] = Number(r.count);
  return out;
}

/** Fotografia del substrato aziendale del tenant (per dashboard e Pulse). */
export async function businessSummary(tenantId: string): Promise<BusinessSummary> {
  return withTx(async (client) => {
    const goals = await client.query<{ key: string; count: string }>(
      `SELECT status AS key, COUNT(*) AS count FROM business.goal WHERE tenant_id = $1 GROUP BY status`,
      [tenantId],
    );
    const memory = await client.query<{ key: string; count: string }>(
      `SELECT kind AS key, COUNT(*) AS count FROM business.memory WHERE tenant_id = $1 GROUP BY kind`,
      [tenantId],
    );
    const pinned = await client.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM business.memory WHERE tenant_id = $1 AND pinned`,
      [tenantId],
    );
    const products = await client.query<{ key: string; count: string }>(
      `SELECT status AS key, COUNT(*) AS count FROM business.product WHERE tenant_id = $1 GROUP BY status`,
      [tenantId],
    );

    const goalsMap = toCountMap(goals.rows);
    const memoryMap = toCountMap(memory.rows);
    const productsMap = toCountMap(products.rows);
    return {
      goals: {
        total: Object.values(goalsMap).reduce((a, b) => a + b, 0),
        active: goalsMap.active ?? 0,
        achieved: goalsMap.achieved ?? 0,
        byStatus: goalsMap,
      },
      memory: {
        total: Object.values(memoryMap).reduce((a, b) => a + b, 0),
        pinned: Number(pinned.rows[0]?.count ?? 0),
        byKind: memoryMap,
      },
      products: {
        total: Object.values(productsMap).reduce((a, b) => a + b, 0),
        active: productsMap.active ?? 0,
        byStatus: productsMap,
      },
    };
  });
}
