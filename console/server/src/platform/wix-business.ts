import { config } from "../config.js";
import { wixCallTool } from "./wix.js";

// Dati commerciali reali del sito Wix.
//
// I numeri non arrivano da REST dirette (il token di istanza non ha gli scope
// necessari) ma dal tool MCP `ExecuteWixAPI`: esegue una funzione JavaScript
// nel sandbox di Wix, dove `wix.request` parla con le REST del sito usando
// l'identita' dell'utente collegato.
//
// Le URL sono le `publicUrl` ufficiali dei metodi (rilevate dallo spec Wix con
// `SearchWixAPISpec`) e i `sourceDocUrls` corrispondono alle pagine di
// documentazione usate per costruire le richieste.

const DOCS_ORDERS =
  "https://dev.wix.com/docs/api-reference/business-solutions/e-commerce/orders/orders/search-orders";
const DOCS_PRODUCTS_QUERY =
  "https://dev.wix.com/docs/api-reference/business-solutions/stores/catalog-v3/products-v3/query-products";
const DOCS_PRODUCTS_CREATE =
  "https://dev.wix.com/docs/api-reference/business-solutions/stores/catalog-v3/products-v3/create-product";
const DOCS_CONTACTS =
  "https://dev.wix.com/docs/api-reference/crm/members-contacts/contacts/contacts/contact-v4/query-contacts";

const SITES_TTL_MS = 5 * 60 * 1000;

export interface WixSite {
  id: string;
  name: string;
}

export interface WixOrder {
  id: string | null;
  number: string | null;
  status: string | null;
  createdDate: string | null;
  total: string | null;
  currency: string | null;
  customer: string | null;
  items: { name: string | null; quantity: number | null; price: string | null }[];
}

export interface WixProduct {
  id: string | null;
  name: string | null;
  slug: string | null;
  productType: string | null;
  visible: boolean | null;
  price: string | null;
  currency: string | null;
  availability: string | null;
  imageUrl: string | null;
}

export interface WixBusinessSnapshot {
  siteId: string;
  generatedAt: string;
  statuses: { orders: number; products: number; contacts: number };
  ordersCount: number;
  productsCount: number;
  contactsCount: number;
  revenue: number;
  averageOrderValue: number;
  currency: string | null;
  orders: WixOrder[];
  products: WixProduct[];
}

export interface WixProductDraft {
  name: string;
  description?: string;
  price: number;
  currency?: string;
  productType?: "PHYSICAL" | "DIGITAL";
}

export interface WixProductResult {
  created: boolean;
  status: number;
  id: string | null;
  name: string | null;
  url: string | null;
  detail: string | null;
}

function toolText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object") {
          const text = (item as { text?: unknown }).text;
          if (typeof text === "string") return text;
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function parseJsonLoose(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.search(/[[{]/);
    if (start < 0) return null;
    try {
      return JSON.parse(trimmed.slice(start));
    } catch {
      return null;
    }
  }
}

function collectSites(value: unknown, out: WixSite[] = [], depth = 0): WixSite[] {
  if (depth > 8 || !value || typeof value !== "object") return out;
  if (Array.isArray(value)) {
    for (const item of value) collectSites(item, out, depth + 1);
    return out;
  }
  const obj = value as Record<string, unknown>;
  const id =
    typeof obj.id === "string"
      ? obj.id
      : typeof obj.siteId === "string"
        ? obj.siteId
        : typeof obj.site_id === "string"
          ? obj.site_id
          : null;
  const name =
    typeof obj.name === "string"
      ? obj.name
      : typeof obj.siteName === "string"
        ? obj.siteName
        : typeof obj.site_name === "string"
          ? obj.site_name
          : typeof obj.label === "string"
            ? obj.label
            : null;
  if (id && name && !out.some((site) => site.id === id)) out.push({ id, name });
  for (const item of Object.values(obj)) collectSites(item, out, depth + 1);
  return out;
}

function parseSitesFromText(text: string): WixSite[] {
  const parsed = parseJsonLoose(text);
  const sites = collectSites(parsed);
  if (sites.length) return sites;
  const idPattern = /"(?:siteId|site_id|id)"\s*:\s*"([0-9a-fA-F-]{8,})"/g;
  const namePattern = /"(?:name|siteName|site_name|label)"\s*:\s*"([^"]+)"/g;
  const ids = [...text.matchAll(idPattern)].map((match) => match[1]);
  const names = [...text.matchAll(namePattern)].map((match) => match[1]);
  return ids.slice(0, 20).map((id, index) => ({ id, name: names[index] ?? id }));
}

const sitesCache = new Map<string, { at: number; sites: WixSite[] }>();

export async function wixDiscoverSites(accessToken: string): Promise<WixSite[]> {
  const hit = sitesCache.get(accessToken.slice(-32));
  if (hit && Date.now() - hit.at < SITES_TTL_MS) return hit.sites;
  const result = await wixCallTool(accessToken, "ListWixSites", {});
  if (!result.ok) throw new Error(result.error ?? "Elenco dei siti Wix non disponibile");
  const sites = parseSitesFromText(toolText(result.content));
  sitesCache.set(accessToken.slice(-32), { at: Date.now(), sites });
  return sites;
}

export interface WixSiteResolution {
  siteId: string | null;
  sites: WixSite[];
  source: "configured" | "discovered";
  /** Sito scoperto da usare se il sito configurato non e' accessibile. */
  fallbackSiteId: string | null;
  /** Avviso leggibile quando sito configurato e account collegato non coincidono. */
  warning: string | null;
}

/**
 * Individua il sito su cui operare.
 *
 * Ordine di fiducia:
 *   1. il sito configurato (`WIX_SITE_ID`) se e' fra i siti dell'account;
 *   2. il sito configurato anche se NON e' fra i siti dell'account: puo' succedere
 *      che `ListWixSites` non restituisca tutti i siti, e soprattutto che il
 *      tenant abbia ricollegato un account diverso da quello che gestisce il
 *      sito. In questo caso il sito configurato resta il primo tentativo e il
 *      chiamante puo' ripiegare su `fallbackSiteId` ricevendo un avviso.
 *   3. il primo sito scoperto, se non c'e' alcun sito configurato.
 */
export async function resolveWixSite(
  accessToken: string,
  preferred?: string | null,
): Promise<WixSiteResolution> {
  let sites: WixSite[] = [];
  try {
    sites = await wixDiscoverSites(accessToken);
  } catch {
    sites = [];
  }
  const candidate = (preferred ?? config.wixSiteId ?? "").trim();
  if (candidate) {
    const known = sites.some((site) => site.id === candidate);
    const fallback = sites.find((site) => site.id !== candidate) ?? null;
    const warning = known
      ? null
      : sites.length
        ? `Il sito configurato (${candidate}) non compare fra i siti dell'account Wix collegato (${sites
            .map((site) => site.name || site.id)
            .join(", ")}). Se non e' accessibile, ricollega l'account che gestisce il sito.`
        : `Il sito configurato (${candidate}) non e' stato verificato: l'account Wix collegato non ha restituito siti.`;
    return {
      siteId: candidate,
      sites,
      source: "configured",
      fallbackSiteId: fallback?.id ?? null,
      warning,
    };
  }
  if (sites.length) {
    return {
      siteId: sites[0].id,
      sites,
      source: "discovered",
      fallbackSiteId: sites[1]?.id ?? null,
      warning: null,
    };
  }
  return { siteId: null, sites, source: "configured", fallbackSiteId: null, warning: null };
}

function businessScript(siteId: string): string {
  return `async function() {
  const siteId = ${JSON.stringify(siteId)};
  const outcome = {};
  const ordersResponse = await wix.request({
    method: 'POST',
    url: 'https://www.wixapis.com/ecom/v1/orders/search',
    scope: 'site',
    siteId: siteId,
    body: {}
  });
  outcome.ordersStatus = ordersResponse.status;
  const ordersData = await ordersResponse.json();
  const orderList = (ordersData && ordersData.orders) || [];
  outcome.ordersCount = orderList.length;
  outcome.orders = orderList.map(function (order) {
    const summary = order.priceSummary || {};
    const contact = order.contactInfo || {};
    return {
      id: order.id || null,
      number: order.number || null,
      status: order.status || null,
      createdDate: order.createdDate || null,
      total: summary.totalPrice || null,
      currency: summary.currency || null,
      customer: contact.name || null,
      items: (order.lineItems || []).map(function (item) {
        return {
          name: item.name || null,
          quantity: typeof item.quantity === 'number' ? item.quantity : null,
          price: item.price || null
        };
      })
    };
  });
  const productsResponse = await wix.request({
    method: 'POST',
    url: 'https://www.wixapis.com/stores/v3/products/query',
    scope: 'site',
    siteId: siteId,
    body: {}
  });
  outcome.productsStatus = productsResponse.status;
  const productsData = await productsResponse.json();
  const productList = (productsData && productsData.products) || [];
  outcome.productsCount = productList.length;
  outcome.products = productList.map(function (product) {
    const range = product.actualPriceRange || null;
    const minimum = range && range.minValue ? range.minValue : null;
    const media = product.media || null;
    const main = media && media.main ? media.main : null;
    const image = main && main.image ? main.image : null;
    const inventory = product.inventory || null;
    return {
      id: product.id || null,
      name: product.name || null,
      slug: product.slug || null,
      productType: product.productType || null,
      visible: typeof product.visible === 'boolean' ? product.visible : null,
      price: minimum && minimum.amount ? minimum.amount : null,
      currency: (minimum && minimum.currency) || product.currency || null,
      availability: inventory ? inventory.availabilityStatus || null : null,
      imageUrl: image && image.url ? image.url : null
    };
  });
  const contactsResponse = await wix.request({
    method: 'POST',
    url: 'https://www.wixapis.com/contacts/v4/contacts/query',
    scope: 'site',
    siteId: siteId,
    body: {}
  });
  outcome.contactsStatus = contactsResponse.status;
  const contactsData = await contactsResponse.json();
  outcome.contactsCount = ((contactsData && contactsData.contacts) || []).length;
  return outcome;
}`;
}

function createProductScript(siteId: string, draft: WixProductDraft): string {
  const currency = (draft.currency ?? "EUR").toUpperCase();
  const productType = draft.productType ?? "PHYSICAL";
  const base: Record<string, unknown> = {
    name: draft.name,
    productType,
    visible: true,
    currency,
    plainDescription: draft.description ?? "",
    variantsInfo: {
      variants: [
        {
          choices: [],
          price: {
            actualPrice: {
              amount: draft.price.toFixed(2),
              currency,
            },
          },
        },
      ],
    },
  };
  if (productType === "PHYSICAL") {
    base.physicalProperties = {
      pricePerUnit: {
        quantity: 1,
        measurementUnit: "KG",
      },
    };
    const variants = (base.variantsInfo as { variants: Record<string, unknown>[] }).variants;
    variants[0].physicalProperties = {
      pricePerUnit: {
        settings: {
          quantity: 1,
          measurementUnit: "KG",
        },
      },
      productDimensions: {
        length: "10",
        width: "10",
        height: "1",
        unit: "CM",
      },
      packageDimensions: {
        length: "10",
        width: "10",
        height: "1",
        unit: "CM",
      },
    };
  }
  const product = base;
  return `async function() {
  const siteId = ${JSON.stringify(siteId)};
  const product = ${JSON.stringify(product, null, 2)};
  const response = await wix.request({
    method: 'POST',
    url: 'https://www.wixapis.com/stores/v3/products',
    scope: 'site',
    siteId: siteId,
    body: {
      product: product,
      fields: ['URL', 'CURRENCY', 'PLAIN_DESCRIPTION']
    }
  });
  let data = null;
  try {
    data = await response.json();
  } catch (err) {
    data = null;
  }
  const created = data && data.product ? data.product : null;
  return {
    status: response.status,
    created: Boolean(created),
    id: created ? created.id || null : null,
    name: created ? created.name || null : null,
    url: created ? created.url || null : null,
    detail: created ? null : JSON.stringify(data).slice(0, 600)
  };
}`;
}

async function executeWixApi(
  accessToken: string,
  siteId: string,
  code: string,
  reason: string,
  hasMutations: boolean,
  sourceDocUrls: string[],
): Promise<unknown> {
  const result = await wixCallTool(accessToken, "ExecuteWixAPI", {
    code,
    reason,
    hasMutations,
    siteId,
    sourceDocUrls,
  });
  if (!result.ok) throw new Error(result.error ?? "ExecuteWixAPI non riuscito");
  const text = toolText(result.content);
  const parsed = parseJsonLoose(text);
  if (parsed === null) {
    throw new Error(text.slice(0, 300) || "ExecuteWixAPI ha restituito una risposta vuota");
  }
  return parsed;
}

function toNumber(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function wixBusinessSnapshot(
  accessToken: string,
  siteId: string,
): Promise<WixBusinessSnapshot> {
  const raw = (await executeWixApi(
    accessToken,
    siteId,
    businessScript(siteId),
    "Leggere ordini, catalogo prodotti e contatti del sito per lo snapshot commerciale",
    false,
    [DOCS_ORDERS, DOCS_PRODUCTS_QUERY, DOCS_CONTACTS],
  )) as Record<string, unknown>;

  const orders = Array.isArray(raw.orders) ? (raw.orders as WixOrder[]) : [];
  const products = Array.isArray(raw.products) ? (raw.products as WixProduct[]) : [];
  const revenue = orders.reduce((sum, order) => sum + toNumber(order.total), 0);
  const paidOrders = orders.filter((order) => order.status !== "CANCELED" && order.status !== "INITIALIZED");
  const revenueBase = paidOrders.length ? paidOrders : orders;
  const revenuePaid = revenueBase.reduce((sum, order) => sum + toNumber(order.total), 0);
  const currency =
    orders.find((order) => order.currency)?.currency ??
    products.find((product) => product.currency)?.currency ??
    null;

  return {
    siteId,
    generatedAt: new Date().toISOString(),
    statuses: {
      orders: toNumber(raw.ordersStatus),
      products: toNumber(raw.productsStatus),
      contacts: toNumber(raw.contactsStatus),
    },
    ordersCount: toNumber(raw.ordersCount),
    productsCount: Math.max(toNumber(raw.productsCount), products.length),
    contactsCount: toNumber(raw.contactsCount),
    revenue: Number(revenuePaid.toFixed(2)),
    averageOrderValue: revenueBase.length ? Number((revenuePaid / revenueBase.length).toFixed(2)) : 0,
    currency,
    orders,
    products,
  };
}

export async function wixCreateProduct(
  accessToken: string,
  siteId: string,
  draft: WixProductDraft,
): Promise<WixProductResult> {
  const raw = (await executeWixApi(
    accessToken,
    siteId,
    createProductScript(siteId, draft),
    "Creare un prodotto in catalogo con nome, descrizione e prezzo",
    true,
    [DOCS_PRODUCTS_CREATE],
  )) as Record<string, unknown>;
  return {
    created: Boolean(raw.created),
    status: toNumber(raw.status),
    id: typeof raw.id === "string" ? raw.id : null,
    name: typeof raw.name === "string" ? raw.name : null,
    url: typeof raw.url === "string" ? raw.url : null,
    detail: typeof raw.detail === "string" ? raw.detail : null,
  };
}
