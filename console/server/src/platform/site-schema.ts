// platform/site-schema.ts — struttura dati del sito pubblicabile.
//
// Il sito non viene piu' ricostruito dal markdown con un parser fragile: il
// modello riceve uno schema JSON esplicito e il renderer lo trasforma in
// pagine HTML deterministiche. Qui vivono i tipi, la validazione e la
// sanificazione: un JSON incompleto o pericoloso non viene pubblicato cosi'
// com'e'.

export type SiteSectionType =
  | "hero"
  | "features"
  | "split"
  | "stats"
  | "testimonial"
  | "pricing"
  | "faq"
  | "gallery"
  | "cta"
  | "text";

export interface SiteLink {
  label: string;
  href: string;
}

export interface SiteBrand {
  name: string;
  tagline: string;
  primary: string;
  secondary: string;
  accent: string;
  background: string;
}

export interface SiteFeature {
  title: string;
  text: string;
  icon: string;
}

export interface SitePlan {
  name: string;
  price: string;
  features: string[];
  highlight: boolean;
}

export interface SiteFaq {
  q: string;
  a: string;
}

export interface SiteStat {
  value: string;
  label: string;
}

export interface SiteTestimonial {
  quote: string;
  author: string;
  role: string;
}

export interface SiteSection {
  type: SiteSectionType;
  eyebrow: string;
  heading: string;
  text: string;
  cta: SiteLink | null;
  secondaryCta: SiteLink | null;
  items: string[];
  features: SiteFeature[];
  plans: SitePlan[];
  faq: SiteFaq[];
  stats: SiteStat[];
  testimonial: SiteTestimonial | null;
  /** Indica se la sezione usa un'immagine reale del run (hero/gallery). */
  image: boolean;
  reverse: boolean;
}

export interface SitePage {
  slug: string;
  title: string;
  navLabel: string;
  seoTitle: string;
  seoDescription: string;
  sections: SiteSection[];
}

export interface SiteContact {
  heading: string;
  text: string;
  email: string;
  phone: string;
  address: string;
}

export interface SiteDocument {
  brand: SiteBrand;
  pages: SitePage[];
  contact: SiteContact;
}

const SECTION_TYPES: SiteSectionType[] = [
  "hero",
  "features",
  "split",
  "stats",
  "testimonial",
  "pricing",
  "faq",
  "gallery",
  "cta",
  "text",
];

const MAX_LEN = 4000;

function str(value: unknown, max = MAX_LEN): string {
  if (typeof value === "string") return value.replace(/\s+/g, " ").trim().slice(0, max);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function strList(value: unknown, maxItems = 12): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => str(item, 600))
    .filter((item) => item.length > 0)
    .slice(0, maxItems);
}

function link(value: unknown): SiteLink | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const label = str(record.label ?? record.text, 120);
  const href = str(record.href ?? record.url ?? record.link, 300);
  if (!label) return null;
  // Solo link interni o http(s): niente javascript:, niente data:.
  const safeHref =
    href.startsWith("#") || href.startsWith("/") || /^https?:\/\//i.test(href) ? href : "#contatti";
  return { label, href: safeHref };
}

function section(value: unknown): SiteSection | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const typeRaw = str(record.type ?? record.kind, 40).toLowerCase() as SiteSectionType;
  const type = SECTION_TYPES.includes(typeRaw) ? typeRaw : "text";

  const features: SiteFeature[] = Array.isArray(record.features)
    ? record.features
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const feature = item as Record<string, unknown>;
          const title = str(feature.title ?? feature.name, 160);
          if (!title) return null;
          return {
            title,
            text: str(feature.text ?? feature.description ?? feature.body, 600),
            icon: str(feature.icon ?? feature.emoji, 40),
          };
        })
        .filter((item): item is SiteFeature => item !== null)
        .slice(0, 12)
    : [];

  const plans: SitePlan[] = Array.isArray(record.plans)
    ? record.plans
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const plan = item as Record<string, unknown>;
          const name = str(plan.name ?? plan.title, 120);
          if (!name) return null;
          return {
            name,
            price: str(plan.price ?? plan.prezzo, 80),
            features: strList(plan.features ?? plan.includes, 12),
            highlight: plan.highlight === true || plan.highlighted === true,
          };
        })
        .filter((item): item is SitePlan => item !== null)
        .slice(0, 6)
    : [];

  const faqSource = record.faq ?? record.items;
  const faq: SiteFaq[] = Array.isArray(faqSource)
    ? faqSource
        .map((item: unknown) => {
          if (!item || typeof item !== "object") return null;
          const entry = item as Record<string, unknown>;
          const q = str(entry.q ?? entry.question ?? entry.title, 300);
          const a = str(entry.a ?? entry.answer ?? entry.text, 1200);
          if (!q) return null;
          return { q, a };
        })
        .filter((item): item is SiteFaq => item !== null)
        .slice(0, 12)
    : [];

  const stats: SiteStat[] = Array.isArray(record.stats)
    ? record.stats
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const stat = item as Record<string, unknown>;
          const value = str(stat.value ?? stat.number, 40);
          const label = str(stat.label ?? stat.text, 120);
          if (!value || !label) return null;
          return { value, label };
        })
        .filter((item): item is SiteStat => item !== null)
        .slice(0, 8)
    : [];

  let testimonial: SiteTestimonial | null = null;
  const rawTestimonial = record.testimonial;
  if (rawTestimonial && typeof rawTestimonial === "object") {
    const item = rawTestimonial as Record<string, unknown>;
    const quote = str(item.quote ?? item.text, 1200);
    if (quote) {
      testimonial = {
        quote,
        author: str(item.author ?? item.name, 120),
        role: str(item.role ?? item.title, 160),
      };
    }
  }

  return {
    type,
    eyebrow: str(record.eyebrow ?? record.kicker, 120),
    heading: str(record.heading ?? record.title, 300),
    text: str(record.text ?? record.body ?? record.description, 2000),
    cta: link(record.cta),
    secondaryCta: link(record.secondaryCta ?? record.secondary_cta),
    items: strList(record.items ?? record.bullets ?? record.list),
    features,
    plans,
    faq,
    stats,
    testimonial,
    image: record.image === true,
    reverse: record.reverse === true,
  };
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

/** Valida e sanifica il JSON prodotto dal modello. */
export function parseSiteDocument(value: unknown): SiteDocument | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;

  const rawBrand = (record.brand ?? {}) as Record<string, unknown>;
  const brand: SiteBrand = {
    name: str(rawBrand.name ?? rawBrand.brand, 120) || "Aethersy",
    tagline: str(rawBrand.tagline ?? rawBrand.description, 300),
    primary: str(rawBrand.primary ?? rawBrand.primaryColor, 20),
    secondary: str(rawBrand.secondary ?? rawBrand.secondaryColor, 20),
    accent: str(rawBrand.accent ?? rawBrand.accentColor, 20),
    background: str(rawBrand.background ?? rawBrand.backgroundColor, 20),
  };

  const pages: SitePage[] = [];
  const seen = new Set<string>();
  for (const rawPage of Array.isArray(record.pages) ? record.pages : []) {
    if (!rawPage || typeof rawPage !== "object") continue;
    const page = rawPage as Record<string, unknown>;
    const title = str(page.title ?? page.name, 160);
    if (!title) continue;
    let slug = slugify(str(page.slug, 80) || title);
    if (!slug) slug = `pagina-${pages.length + 1}`;
    if (slug === "home" && pages.length === 0) slug = "home";
    if (seen.has(slug)) slug = `${slug}-${pages.length + 1}`;
    seen.add(slug);
    const sections = (Array.isArray(page.sections) ? page.sections : [])
      .map(section)
      .filter((item): item is SiteSection => item !== null);
    if (sections.length === 0) continue;
    pages.push({
      slug,
      title,
      navLabel: str(page.navLabel ?? page.nav_label ?? page.title, 80) || title,
      seoTitle: str(page.seoTitle ?? page.seo_title, 180),
      seoDescription: str(page.seoDescription ?? page.seo_description, 400),
      sections,
    });
    if (pages.length >= 10) break;
  }

  if (pages.length === 0) return null;

  const rawContact = (record.contact ?? {}) as Record<string, unknown>;
  const contact: SiteContact = {
    heading: str(rawContact.heading ?? rawContact.title, 160) || "Contatti",
    text: str(rawContact.text ?? rawContact.description, 800),
    email: str(rawContact.email, 160),
    phone: str(rawContact.phone, 60),
    address: str(rawContact.address, 300),
  };

  return { brand, pages, contact };
}

/**
 * Estrae il primo oggetto JSON da una risposta del modello: il modello
 * spesso aggiunge testo introduttivo o fence markdown.
 */
export function extractJson(value: string): unknown {
  const text = value.trim();
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  try {
    return JSON.parse(candidate);
  } catch {
    // Prova a isolare il primo blocco {...} bilanciato.
    const start = candidate.indexOf("{");
    if (start < 0) return null;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < candidate.length; index++) {
      const char = candidate[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') inString = false;
        continue;
      }
      if (char === '"') inString = true;
      else if (char === "{") depth += 1;
      else if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          try {
            return JSON.parse(candidate.slice(start, index + 1));
          } catch {
            return null;
          }
        }
      }
    }
    return null;
  }
}
