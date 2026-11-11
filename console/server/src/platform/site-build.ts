// platform/site-build.ts — costruzione e pubblicazione del sito.
//
// Percorso: brief + deliverable del run -> contesto di ricerca reale ->
// documento JSON validato -> pagine HTML deterministiche -> snapshot pubblico
// su /s/<slug>. Il sito pubblicato non richiama piu' il modello.
//
// Se il modello non produce un JSON valido si ripiega sui deliverable testuali
// del run (copy/sitemap/SEO): il sito viene pubblicato comunque, dichiarando
// che la struttura e' quella di fallback.

import { tenantById } from "../metering/repo.js";
import { meteredText } from "../pipeline/metered-chat.js";
import { researchContext, topicFromBrief } from "../research/report.js";
import { loadSiteRun } from "./site.js";
import { extractJson, parseSiteDocument, slugify, type SiteDocument } from "./site-schema.js";
import { savePublishedSite, uniqueSiteSlug } from "./site-repo.js";

export interface BuildSiteResult {
  slug: string;
  url: string;
  title: string;
  pages: number;
  fallback: boolean;
  warning: string | null;
  credits: number;
  /** Numero di immagini reali pubblicate con il sito. */
  images: number;
}

function assetContent(meta: unknown): string {
  const record = (meta ?? {}) as Record<string, unknown>;
  return typeof record.content === "string" ? record.content : "";
}

/** Immagini reali del run (asset binari) come data URI. */
function assetImages(assets: { kind: string; meta: unknown }[]): string[] {
  const images: string[] = [];
  for (const asset of assets) {
    if (asset.kind !== "image") continue;
    const meta = (asset.meta ?? {}) as Record<string, unknown>;
    const base64 = typeof meta.contentBase64 === "string" ? meta.contentBase64 : null;
    if (!base64) continue;
    const mime = typeof meta.mime === "string" ? meta.mime : "image/jpeg";
    images.push(`data:${mime};base64,${base64}`);
  }
  return images;
}

/** Prompt: schema JSON esplicito, contenuti reali, niente segnaposto. */
function buildSitePrompt(input: {
  brand: string;
  topic: string;
  copy: string;
  sitemap: string;
  seo: string;
  research: string;
}): string {
  return [
    "Sei un web designer senior. Produci il documento JSON completo di un sito web aziendale professionale.",
    "",
    "REGOLE ASSOLUTE",
    "- Rispondi ESCLUSIVAMENTE con un oggetto JSON valido, senza testo prima o dopo e senza fence markdown.",
    "- Usa solo informazioni reali: non inventare clienti, prezzi, certificazioni o statistiche.",
    "- Copia in italiano, tono professionale e concreto, senza emoji e senza segnaposto tipo " +
      '"Lorem ipsum" o "[inserire qui]".',
    "- La struttura e' vincolata: usa i tipi di sezione indicati.",
    "",
    "STRUTTURA JSON",
    JSON.stringify(
      {
        brand: {
          name: "string",
          tagline: "string",
          primary: "colore esadecimale",
          accent: "colore esadecimale",
          secondary: "colore esadecimale",
          background: "colore esadecimale",
        },
        pages: [
          {
            slug: "home",
            title: "string",
            navLabel: "string",
            seoTitle: "string",
            seoDescription: "string",
            sections: [
              {
                type: "hero | features | split | stats | testimonial | pricing | faq | gallery | cta | text",
                eyebrow: "string",
                heading: "string",
                text: "string",
                cta: { label: "string", href: "#contatti" },
                secondaryCta: { label: "string", href: "#contatti" },
                items: ["string"],
                features: [{ title: "string", text: "string", icon: "string" }],
                plans: [{ name: "string", price: "string", features: ["string"], highlight: true }],
                faq: [{ q: "string", a: "string" }],
                stats: [{ value: "string", label: "string" }],
                testimonial: { quote: "string", author: "string", role: "string" },
                image: true,
                reverse: false,
              },
            ],
          },
        ],
        contact: { heading: "string", text: "string", email: "string", phone: "string", address: "string" },
      },
      null,
      1,
    ),
    "",
    "REGOLE DI COMPOSIZIONE",
    "- La prima pagina deve avere slug \"home\" e iniziare con una sezione \"hero\".",
    "- Produci da 3 a 6 pagine: home, servizi, about/chi-siamo, progetti o lavori, contatti.",
    "- Usa almeno una sezione \"features\" e una \"cta\" nella home; una \"faq\" e una \"split\" in almeno una pagina interna.",
    "- I CTA puntano a \"#contatti\".",
    "- La sezione contatti e' gia' gestita: non ripeterla tra le sezioni.",
    "",
    `BRAND: ${input.brand}`,
    input.topic ? `TEMA: ${input.topic}` : "",
    input.research ? `\nCONTESTO DI RICERCA REALE (dati verificabili, con fonti):\n${input.research}` : "",
    input.copy ? `\nCOPY GIA' REDATTO (da riusare e completare):\n${input.copy.slice(0, 5000)}` : "",
    input.sitemap ? `\nSITEMAP REDATTO (da rispettare):\n${input.sitemap.slice(0, 2000)}` : "",
    input.seo ? `\nSEO REDATTO (da riusare):\n${input.seo.slice(0, 2000)}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Documento di fallback ricostruito dai deliverable testuali del run. */
function fallbackDocument(input: {
  brand: string;
  topic: string;
  copy: string;
  sitemap: string;
}): SiteDocument {
  const pages: SiteDocument["pages"] = [];
  const blocks = input.copy.split(/\*\*Pagina\s+([^*]+)\*\*/i);
  for (let index = 1; index < blocks.length - 1; index += 2) {
    const label = blocks[index].trim();
    const body = blocks[index + 1] ?? "";
    const heading = (body.match(/Titolo H1:\s*(.+)/i)?.[1] ?? "").trim();
    const intro = (body.match(/(?:Sottotitolo|Introduzione):\s*(.+)/i)?.[1] ?? "").trim();
    const cta = (body.match(/Call to Action \(CTA\):\s*(.+)/i)?.[1] ?? "").trim();
    const items = body
      .split(/\r?\n/)
      .map((line) => line.match(/^\s*\d+\.\s+(?:\*\*)?(.+?)(?:\*\*)?\s*$/)?.[1]?.replace(/\*+/g, "").trim() ?? "")
      .filter((item) => item && !/^Pagina\b/i.test(item));
    if (!heading && !intro) continue;
    const slug = slugify(label) || `pagina-${pages.length + 1}`;
    pages.push({
      slug: pages.length === 0 ? "home" : slug,
      title: label.replace(/\s*\([^)]*\)/g, "").trim() || heading || `Pagina ${pages.length + 1}`,
      navLabel: label.replace(/\s*\([^)]*\)/g, "").trim() || heading,
      seoTitle: heading,
      seoDescription: intro,
      sections: [
        {
          type: pages.length === 0 ? "hero" : "text",
          eyebrow: "",
          heading: heading || label,
          text: intro,
          cta: cta ? { label: cta, href: "#contatti" } : null,
          secondaryCta: null,
          items,
          features: [],
          plans: [],
          faq: [],
          stats: [],
          testimonial: null,
          image: false,
          reverse: false,
        },
      ],
    });
    if (pages.length >= 8) break;
  }

  if (pages.length === 0) {
    pages.push({
      slug: "home",
      title: input.brand,
      navLabel: "Home",
      seoTitle: input.brand,
      seoDescription: input.topic,
      sections: [
        {
          type: "hero",
          eyebrow: "",
          heading: input.brand,
          text: input.topic,
          cta: { label: "Richiedi informazioni", href: "#contatti" },
          secondaryCta: null,
          items: [],
          features: [],
          plans: [],
          faq: [],
          stats: [],
          testimonial: null,
          image: false,
          reverse: false,
        },
      ],
    });
  }

  return {
    brand: { name: input.brand, tagline: input.topic, primary: "", secondary: "", accent: "", background: "" },
    pages,
    contact: { heading: "Contatti", text: "Parliamo del tuo progetto.", email: "", phone: "", address: "" },
  };
}

/**
 * Normalizza la home: il modello puo' disperdere le sezioni-cardinali sulle
 * pagine interne, lasciando una home con solo hero e contatti. Qui la home
 * viene completata con le sezioni che mancano, riusando il contenuto reale
 * del documento (nessun testo inventato).
 */
function normalizeHome(document: SiteDocument): SiteDocument {
  const home = document.pages.find((page) => page.slug === "home") ?? document.pages[0];
  if (!home) return document;

  const has = (type: SiteDocument["pages"][number]["sections"][number]["type"]) =>
    home.sections.some((section) => section.type === type);

  // Le features: riuse quelle di un'altra pagina, altrimenti i punti chiave
  // delle pagine interne come voci della griglia.
  if (!has("features")) {
    const elsewhere = document.pages
      .flatMap((page) => page.sections)
      .find((section) => section.type === "features" && section.features.length > 0);
    const features =
      elsewhere?.features.map((feature) => ({ ...feature })) ??
      document.pages
        .filter((page) => page.slug !== home.slug)
        .slice(0, 4)
        .map((page) => ({
          title: page.navLabel || page.title,
          text: page.seoDescription || page.seoTitle || "",
          icon: "",
        }));
    if (features.length > 0) {
      home.sections.splice(1, 0, {
        type: "features",
        eyebrow: "Cosa offriamo",
        heading: "I punti di forza",
        text: "",
        cta: null,
        secondaryCta: null,
        items: [],
        features,
        plans: [],
        faq: [],
        stats: [],
        testimonial: null,
        image: false,
        reverse: false,
      });
    }
  }

  // La fascia CTA finale: sempre, con il contatto come destinazione.
  if (!has("cta")) {
    home.sections.splice(home.sections.length - 1, 0, {
      type: "cta",
      eyebrow: "",
      heading: document.brand.tagline || "Parliamo del tuo progetto",
      text: "",
      cta: { label: "Contattaci", href: "#contatti" },
      secondaryCta: null,
      items: [],
      features: [],
      plans: [],
      faq: [],
      stats: [],
      testimonial: null,
      image: false,
      reverse: false,
    });
  }

  return document;
}

/**
 * Costruisce il sito del run e lo pubblica. Restituisce slug e URL pubblico.
 */
export async function buildAndPublishSite(input: {
  tenantId: string;
  runId: string;
  baseUrl: string;
}): Promise<BuildSiteResult> {
  const loaded = await loadSiteRun(input.runId);
  if (!loaded) throw new Error("run inesistente");
  if (loaded.run.tenant_id !== input.tenantId) throw new Error("run di un altro tenant");

  const tenant = await tenantById(input.tenantId);
  if (!tenant) throw new Error("tenant inesistente");

  const contents = loaded.assets.map((asset) => ({ name: asset.name, content: assetContent(asset.meta) }));
  const copy = contents.find((c) => /copy/i.test(c.name))?.content ?? "";
  const sitemap = contents.find((c) => /sitemap|wireframe/i.test(c.name))?.content ?? "";
  const seo = contents.find((c) => /seo/i.test(c.name))?.content ?? "";

  const brandName = loaded.run.title
    .replace(/^Sito Vetrina\s*/i, "")
    .replace(/\s*[-–|]\s*Aethersy.*$/i, "")
    .trim() || "Aethersy";
  const topic = topicFromBrief(loaded.run.brief) || loaded.run.title;

  const research = topic
    ? await researchContext(topic).catch(() => ({ text: "", sources: [], provider: "none" }))
    : { text: "", sources: [], provider: "none" };

  const prompt = buildSitePrompt({ brand: brandName, topic, copy, sitemap, seo, research: research.text });

  let document: SiteDocument | null = null;
  let fallback = false;
  let warning: string | null = null;
  let credits = 0;

  try {
    const answer = await meteredText({
      tenant,
      prompt,
      preferFree: false,
      suffix: "site-build",
      flowRunId: null,
    });
    credits += answer.credits;
    document = parseSiteDocument(extractJson(answer.answer));
    if (!document) {
      fallback = true;
      warning =
        "Il modello non ha restituito una struttura JSON valida: il sito e' stato ricostruito dai deliverable testuali del run.";
    }
  } catch (err) {
    fallback = true;
    warning = `Generazione AI non riuscita (${(err as Error).message}): il sito e' stato ricostruito dai deliverable testuali del run.`;
  }

  if (!document) {
    document = fallbackDocument({ brand: brandName, topic, copy, sitemap });
  }
  document = normalizeHome(document);

  // Le immagini reali del run alimentano hero e gallery.
  const images = assetImages(loaded.assets as { kind: string; meta: unknown }[]);
  if (images.length > 0) {
    let used = 0;
    for (const page of document.pages) {
      for (const section of page.sections) {
        if (section.type === "hero" && used < images.length) {
          section.image = true;
          used += 1;
        } else if (section.type === "gallery") {
          used += 1;
        }
      }
    }
  }

  const slug = await uniqueSiteSlug(brandName, input.runId);
  await savePublishedSite({
    tenantId: input.tenantId,
    runId: input.runId,
    slug,
    document,
    images,
  });

  return {
    slug,
    url: `${input.baseUrl}/s/${slug}`,
    title: document.brand.name,
    pages: document.pages.length,
    fallback,
    warning,
    credits,
    images: images.length,
  };
}
