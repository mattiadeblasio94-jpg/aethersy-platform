// platform/site-repo.ts — persistenza dei siti pubblicati.
//
// Il sito pubblicato e' uno snapshot: una volta pubblicato e' servito dal BFF
// senza richiamare il modello. Ripubblicare lo stesso run aggiorna lo
// snapshot (stesso slug, contenuto nuovo).

import { withTx } from "../metering/db.js";
import type { SiteDocument } from "./site-schema.js";

export interface PublishedSiteRow {
  id: string;
  tenant_id: string;
  run_id: string;
  slug: string;
  title: string;
  description: string;
  brand: SiteDocument["brand"];
  pages: SiteDocument["pages"];
  /** Immagini reali del sito (data URI). */
  assets: string[];
  status: string;
  published_at: Date;
  updated_at: Date;
}

export interface PublishedSiteSummary {
  id: string;
  runId: string;
  slug: string;
  title: string;
  description: string;
  pageCount: number;
  status: string;
  publishedAt: Date;
  url: string;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

/** Slug leggibile e univoco: base dal titolo + suffisso se gia' occupato. */
export async function uniqueSiteSlug(base: string, runId: string): Promise<string> {
  const root = slugify(base) || `sito-${runId.slice(0, 8)}`;
  const taken = await withTx(async (client) => {
    const { rows } = await client.query<{ slug: string }>(
      `SELECT slug FROM pipeline.published_site WHERE slug = $1 OR slug LIKE $2`,
      [root, `${root}-%`],
    );
    return new Set(rows.map((row) => row.slug));
  });
  if (!taken.has(root)) return root;
  for (let index = 2; index < 40; index++) {
    const candidate = `${root}-${index}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${root}-${runId.slice(0, 8)}`;
}

/** Salva (o aggiorna) lo snapshot del sito per un run. */
export async function savePublishedSite(input: {
  tenantId: string;
  runId: string;
  slug: string;
  document: SiteDocument;
  images?: string[];
}): Promise<PublishedSiteRow> {
  const title = input.document.brand.name;
  const description = input.document.brand.tagline;
  const pages = input.document.pages;
  return withTx(async (client) => {
    const { rows } = await client.query<PublishedSiteRow>(
      `INSERT INTO pipeline.published_site
         (tenant_id, run_id, slug, title, description, brand, pages, assets, status, published_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, 'published', now(), now())
       ON CONFLICT (run_id) DO UPDATE SET
         slug = EXCLUDED.slug,
         title = EXCLUDED.title,
         description = EXCLUDED.description,
         brand = EXCLUDED.brand,
         pages = EXCLUDED.pages,
         assets = EXCLUDED.assets,
         status = 'published',
         updated_at = now()
       RETURNING *`,
      [
        input.tenantId,
        input.runId,
        input.slug,
        title,
        description,
        JSON.stringify(input.document.brand),
        JSON.stringify(pages),
        JSON.stringify(input.images ?? []),
      ],
    );
    return rows[0];
  });
}

/** Carica il sito pubblicato per slug (rotte pubbliche: nessun tenant). */
export async function getPublishedSite(slug: string): Promise<PublishedSiteRow | null> {
  return withTx(async (client) => {
    const { rows } = await client.query<PublishedSiteRow>(
      `SELECT * FROM pipeline.published_site WHERE slug = $1 AND status = 'published'`,
      [slug],
    );
    return rows[0] ?? null;
  });
}

/** Elenco dei siti pubblicati dal tenant. */
export async function listPublishedSites(
  tenantId: string,
  baseUrl: string,
): Promise<PublishedSiteSummary[]> {
  return withTx(async (client) => {
    const { rows } = await client.query<PublishedSiteRow>(
      `SELECT * FROM pipeline.published_site
        WHERE tenant_id = $1
        ORDER BY published_at DESC
        LIMIT 50`,
      [tenantId],
    );
    return rows.map((row) => ({
      id: row.id,
      runId: row.run_id,
      slug: row.slug,
      title: row.title,
      description: row.description,
      pageCount: Array.isArray(row.pages) ? row.pages.length : 0,
      status: row.status,
      publishedAt: row.published_at,
      url: `${baseUrl}/s/${row.slug}`,
    }));
  });
}

/** Ritira il sito (non lo cancella: lo storico resta). */
export async function unpublishSite(tenantId: string, slug: string): Promise<boolean> {
  return withTx(async (client) => {
    const { rowCount } = await client.query(
      `UPDATE pipeline.published_site SET status = 'unpublished', updated_at = now()
        WHERE tenant_id = $1 AND slug = $2`,
      [tenantId, slug],
    );
    return (rowCount ?? 0) > 0;
  });
}
