// platform/public-site-routes.ts — il sito pubblicato, servito al pubblico.
//
// Le pagine sono gia' renderizzate e salvate: qui si serve HTML statico con
// cache, piu' sitemap.xml e robots.txt per lo stesso dominio. Il lead del
// form viene attribuito al tenant che ha commissionato il sito.
//
// Nessuna sessione richiesta: e' il contenuto che il cliente condivide con
// i propri contatti.

import type { FastifyInstance } from "fastify";
import { getPublishedSite } from "./site-repo.js";
import { renderSitePageHtml } from "./site-render.js";
import { publicBaseUrl } from "../public-url.js";
import type { SiteDocument, SitePage } from "./site-schema.js";

interface PublicSiteRow {
  run_id: string;
  slug: string;
  title: string;
  brand: SiteDocument["brand"] & { contact?: SiteDocument["contact"] };
  pages: SitePage[];
  assets: string[];
}

function notFoundPage(): string {
  return [
    "<!doctype html><html lang=it><head><meta charset=utf-8>",
    "<meta name=viewport content='width=device-width,initial-scale=1'>",
    "<title>Sito non trovato</title>",
    "<style>body{font-family:system-ui,sans-serif;background:#080b16;color:#e9eefb;padding:64px;line-height:1.6}h1{font-size:2rem}a{color:#00d4ff}</style>",
    "</head><body><h1>Sito non trovato</h1>",
    "<p>Questo sito non e' (o non e' piu') pubblicato.</p>",
    "<p><a href='/'>Torna alla piattaforma Aethersy</a></p></body></html>",
  ].join("");
}

export async function registerPublicSiteRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { slug: string; page?: string } }>("/s/:slug/:page", async (request, reply) => {
    const site = (await getPublishedSite(request.params.slug)) as PublicSiteRow | null;
    if (!site) {
      return reply
        .code(404)
        .header("content-type", "text/html; charset=utf-8")
        .send(notFoundPage());
    }

    const base = publicBaseUrl();
    const document: SiteDocument = {
      brand: site.brand,
      pages: site.pages,
      contact: site.brand.contact ?? {
        heading: "Contatti",
        text: "",
        email: "",
        phone: "",
        address: "",
      },
    };

    const wanted = request.params.page ?? "home";
    const page = site.pages.find((item) => item.slug === wanted) ?? site.pages[0];
    if (!page) {
      return reply.code(404).header("content-type", "text/html; charset=utf-8").send(notFoundPage());
    }

    const html = renderSitePageHtml(document, page, {
      brandName: site.title,
      canonicalBase: base,
      images: Array.isArray(site.assets) ? site.assets : [],
      slug: site.slug,
    });

    return reply
      .header("content-type", "text/html; charset=utf-8")
      .header("cache-control", "public, max-age=300")
      .send(html);
  });

  app.post<{ Params: { slug: string } }>("/s/:slug/lead", async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    // Honeypot: i bot compilano "website", l'utente no.
    if (String(body.website ?? "").trim()) {
      return reply
        .code(201)
        .send({ id: null, message: "Richiesta inviata. Rispondiamo entro 24 ore." });
    }

    const site = await getPublishedSite(request.params.slug);
    if (!site) {
      return reply.code(404).send({ code: "NOT_FOUND", message: "Sito non trovato" });
    }

    const { createSiteLead } = await import("./site.js");
    try {
      const created = await createSiteLead(site.run_id, {
        name: typeof body.name === "string" ? body.name : undefined,
        email: typeof body.email === "string" ? body.email : undefined,
        phone: typeof body.phone === "string" ? body.phone : undefined,
        message: typeof body.message === "string" ? body.message : undefined,
        website: typeof body.website === "string" ? body.website : undefined,
        utm: (body.utm ?? {}) as Record<string, unknown>,
        payload: {
          origin: request.headers.origin ?? null,
          site_slug: site.slug,
          user_agent: request.headers["user-agent"] ?? null,
        },
      });
      if (!created) {
        return reply.code(404).send({ code: "NOT_FOUND", message: "Sito non trovato" });
      }
      return reply
        .code(201)
        .send({ id: created.id, message: "Richiesta inviata. Rispondiamo entro 24 ore." });
    } catch (err) {
      return reply
        .code(400)
        .send({ code: "INVALID_INPUT", message: (err as Error).message });
    }
  });
}
