// platform/site.ts — rendering del sito pubblicabile di un run "website".
//
// I deliverable del run (copy, sitemap, SEO) sono testi reali prodotti dal
// modello: qui vengono trasformati in una pagina HTML completa, servita dal
// BFF a un URL pubblico stabile. Nessun dato di esempio: se il run non ha
// deliverable, non c'e' pagina.

import { withTx } from "../metering/db.js";

export interface SitePage {
  runId: string;
  title: string;
  description: string;
  html: string;
}

interface RunRow {
  id: string;
  tenant_id: string;
  title: string;
  stage: string;
  brief: unknown;
  created_at: Date;
}

interface AssetRow {
  name: string;
  kind: string;
  meta: unknown;
}

interface CopySection {
  page: string;
  label: string;
  heading: string;
  intro: string;
  cta: string;
  items: string[];
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function assetContent(meta: unknown): string {
  const m = (meta ?? {}) as Record<string, unknown>;
  return text(m.content);
}

/** Divide il documento di copy nelle sezioni "Pagina X". */
function parseCopySections(content: string): CopySection[] {
  const sections: CopySection[] = [];
  const parts = content.split(/\*\*Pagina\s+([^*]+)\*\*/i);
  // parts[0] = preambolo, poi coppie (nomePagina, corpo).
  for (let i = 1; i < parts.length - 1; i += 2) {
    const page = parts[i].trim();
    const body = parts[i + 1] ?? "";
    const heading = text(body.match(/Titolo H1:\s*(.+)/i)?.[1]);
    const intro =
      text(body.match(/Sottotitolo:\s*(.+)/i)?.[1]) ||
      text(body.match(/Introduzione:\s*(.+)/i)?.[1]);
    const cta = text(body.match(/Call to Action \(CTA\):\s*(.+)/i)?.[1]);
    const items: string[] = [];
    for (const line of body.split(/\r?\n/)) {
      const m = line.match(/^\s*\d+\.\s+(?:\*\*)?(.+?)(?:\*\*)?\s*$/);
      if (!m) continue;
      const value = m[1].replace(/\*+/g, "").trim();
      if (!value || /^Pagina\b/i.test(value)) continue;
      items.push(value);
    }
    const label = page.replace(/\s*\([^)]*\)/g, "").trim() || page;
    sections.push({ page, label, heading, intro, cta, items });
  }
  return sections;
}

/** Voci di navigazione dal documento sitemap (livello 1). */
function parseNav(content: string): string[] {
  const nav: string[] = [];
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(/^\s*\d+\.\s+\*\*([^*]+)\*\*/);
    if (m) nav.push(m[1].trim());
  }
  return nav;
}

/** Title tag e meta description dal documento SEO. */
function parseSeo(content: string): { title: string; description: string } {
  const title = text(content.match(/\*\*Title Tag:\*\*[^*]*\(es\.?\s*"([^"]+)"/i)?.[1]);
  const description = text(content.match(/\*\*Meta Description:\*\*[^*]*\(es\.?\s*"([^"]+)"/i)?.[1]);
  return { title, description };
}

const HTML_ENTITIES: Record<string, string> = {
  "&": "&#38;",
  "<": "&#60;",
  ">": "&#62;",
  '"': "&#34;",
  "'": "'",
};

function esc(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => HTML_ENTITIES[ch] ?? ch);
}

function brandFromTitle(title: string): string {
  const cleaned = title
    .replace(/^Sito Vetrina\s*/i, "")
    .replace(/\s*[-–|]\s*Aethersy.*$/i, "")
    .trim();
  return cleaned || title || "Aethersy";
}

function renderHtml(opts: {
  brand: string;
  title: string;
  description: string;
  nav: string[];
  hero: CopySection | null;
  sections: CopySection[];
  runId: string;
}): string {
  const { brand, title, description, nav, hero, sections, runId } = opts;
  const heroTitle = hero?.heading || title;
  const heroIntro = hero?.intro || description;
  const cta = hero?.cta || "Richiedi una consulenza";

  const featureItems = (hero?.items ?? []).slice(0, 6);
  const otherSections = sections.filter((s) => s.label && !/^home$/i.test(s.label));

  const sectionIds = new Map<string, string>();
  const usedIds = new Set<string>();
  for (const section of sections) {
    const base = slug(section.label);
    let id = base || "sezione";
    let n = 2;
    while (usedIds.has(id)) id = `${base}-${n++}`;
    usedIds.add(id);
    sectionIds.set(section.label, id);
  }

  const navHtml = nav
    .filter((item) => !/contatti/i.test(item))
    .map((item) => {
      const label = item.replace(/\s*\([^)]*\)/g, "").trim() || item;
      const id = sectionIds.get(label) ?? (slug(label) === "home" ? "home" : slug(label));
      return `<a href="#${id}">${esc(label)}</a>`;
    })
    .join("");

  const featuresHtml = featureItems.length
    ? `<section id="servizi" class="section"><h2>${esc(featureItems[0].split(/[:\-–]/)[0] || "Cosa offriamo")}</h2>
       <div class="grid">${featureItems
         .map((item) => {
           const [head, ...rest] = item.split(/[:\-–]/);
           const body = rest.join(":").trim();
           return `<article class="card"><h3>${esc(head.trim())}</h3>${
             body ? `<p>${esc(body)}</p>` : ""
           }</article>`;
         })
         .join("")}</div></section>`
    : "";

  const sectionsHtml = otherSections
    .map(
      (section) => `<section id="${sectionIds.get(section.label) ?? slug(section.label)}" class="section">
        <h2>${esc(section.heading || section.label)}</h2>
        ${section.intro ? `<p class="lead">${esc(section.intro)}</p>` : ""}
        ${
          section.items.length
            ? `<ul>${section.items.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>`
            : ""
        }
      </section>`,
    )
    .join("");

  return `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(description)}" />
<link rel="icon" href="/brand/logo-192.png" />
<style>
  :root { --bg:#080b16; --panel:#0f1526; --text:#e9eefb; --muted:#9aa7c7; --accent:#00d4ff; --accent2:#ff9f1c; --line:#1e2942; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--text); font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; line-height:1.6; }
  a { color:var(--accent); text-decoration:none; }
  header { position:sticky; top:0; z-index:10; background:rgba(8,11,22,.92); backdrop-filter:blur(8px); border-bottom:1px solid var(--line); }
  .bar { max-width:1080px; margin:0 auto; padding:14px 20px; display:flex; align-items:center; justify-content:space-between; gap:16px; }
  .brand { font-weight:700; letter-spacing:.14em; text-transform:uppercase; }
  nav { display:flex; gap:18px; flex-wrap:wrap; font-size:.92rem; }
  nav a { color:var(--muted); }
  nav a:hover { color:var(--text); }
  main { max-width:1080px; margin:0 auto; padding:0 20px 72px; }
  .hero { padding:84px 0 56px; border-bottom:1px solid var(--line); }
  .eyebrow { color:var(--accent2); text-transform:uppercase; letter-spacing:.18em; font-size:.76rem; }
  h1 { font-size:clamp(2rem,5vw,3.4rem); line-height:1.12; margin:14px 0 18px; }
  h2 { font-size:clamp(1.4rem,3vw,2rem); margin:0 0 18px; }
  h3 { margin:0 0 8px; font-size:1.05rem; color:var(--accent); }
  p { color:var(--muted); max-width:70ch; }
  .lead { font-size:1.1rem; }
  .cta { display:inline-block; margin-top:18px; padding:13px 26px; border-radius:999px; background:linear-gradient(90deg,var(--accent),#4deeff); color:#04070f; font-weight:700; }
  .cta:hover { filter:brightness(1.08); }
  .section { padding:52px 0; border-bottom:1px solid var(--line); }
  .grid { display:grid; gap:16px; grid-template-columns:repeat(auto-fit,minmax(250px,1fr)); }
  .card { background:var(--panel); border:1px solid var(--line); border-radius:14px; padding:20px; }
  .card p { margin:0; font-size:.95rem; }
  ul { color:var(--muted); padding-left:20px; }
  .lead-form { display:grid; gap:14px; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); margin-top:22px; max-width:760px; }
  .lead-form label { display:grid; gap:6px; font-size:.9rem; color:var(--muted); }
  .lead-form input, .lead-form textarea { background:#0b1120; border:1px solid var(--line); border-radius:10px; color:var(--text); padding:11px 13px; font:inherit; }
  .lead-form input:focus, .lead-form textarea:focus { outline:2px solid var(--accent); outline-offset:1px; }
  .lead-form .full { grid-column:1/-1; }
  .lead-form .hp { position:absolute; left:-9999px; }
  .lead-form button { justify-self:start; border:0; cursor:pointer; font:inherit; }
  .lead-form .status { margin:0; min-height:1.4em; }
  .lead-form .status.ok { color:#4ade80; }
  .lead-form .status.err { color:#f87171; }
  footer { border-top:1px solid var(--line); color:var(--muted); font-size:.85rem; }
  footer .bar { flex-direction:column; align-items:flex-start; gap:6px; }
</style>
</head>
<body>
<header><div class="bar"><span class="brand">${esc(brand)}</span><nav>${navHtml}</nav></div></header>
<main>
  <section id="home" class="hero">
    <p class="eyebrow">${esc(brand)}</p>
    <h1>${esc(heroTitle)}</h1>
    ${heroIntro ? `<p class="lead">${esc(heroIntro)}</p>` : ""}
    <a class="cta" href="#contatti">${esc(cta)}</a>
  </section>
  ${featuresHtml}
  ${sectionsHtml}
  <section id="contatti" class="section">
    <h2>Contatti</h2>
    <p>Scrivici per una consulenza: rispondiamo entro 24 ore lavorative.</p>
    <form id="lead-form" class="lead-form" method="post" action="/api/platform/sites/${esc(runId)}/leads">
      <label>Nome<input type="text" name="name" autocomplete="name" maxlength="120" /></label>
      <label>Email<input type="email" name="email" autocomplete="email" required maxlength="160" /></label>
      <label class="hp" aria-hidden="true">Sito web<input type="text" name="website" tabindex="-1" autocomplete="off" /></label>
      <label class="full">Messaggio<textarea name="message" rows="4" maxlength="2000"></textarea></label>
      <button class="cta" type="submit">Invia richiesta</button>
      <p class="status full" id="lead-status" role="status"></p>
    </form>
  </section>
</main>
<footer><div class="bar"><span>© ${new Date().getFullYear()} ${esc(brand)}</span><span>Pubblicato da Aethersy · run ${esc(runId.slice(0, 8))}</span></div></footer>
<script>
(function () {
  var form = document.getElementById("lead-form");
  var status = document.getElementById("lead-status");
  if (!form || !status) return;
  form.addEventListener("submit", function (event) {
    event.preventDefault();
    var data = new FormData(form);
    var payload = {
      name: String(data.get("name") || ""),
      email: String(data.get("email") || ""),
      message: String(data.get("message") || ""),
      website: String(data.get("website") || "")
    };
    status.className = "status full";
    status.textContent = "Invio in corso...";
    fetch(form.action, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }).then(function (res) {
      return res.json().then(function (body) { return { ok: res.ok, body: body }; });
    }).then(function (out) {
      if (out.ok) {
        form.reset();
        status.className = "status full ok";
        status.textContent = out.body && out.body.message ? out.body.message : "Richiesta inviata. Rispondiamo entro 24 ore.";
      } else {
        status.className = "status full err";
        status.textContent = out.body && out.body.message ? out.body.message : "Invio non riuscito. Riprova o scrivici via email.";
      }
    }).catch(function () {
      status.className = "status full err";
      status.textContent = "Invio non riuscito. Controlla la connessione e riprova.";
    });
  });
})();
</script>
</body>
</html>`;
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Carica il run e i suoi deliverable.
 *
 * Il sito e' pubblico perche' e' il deliverable che il cliente riceve: la
 * chiave d'accesso e' il UUID del run (non enumerabile). Per questo il run non
 * e' filtrato per tenant: la pagina espone solo i documenti di copy, sitemap e
 * SEO, cioe' il contenuto destinato al pubblico.
 */
export async function loadSiteRun(runId: string): Promise<{ run: RunRow; assets: AssetRow[] } | null> {
  const run = await withTx(async (client) => {
    const { rows } = await client.query<RunRow>(
      `SELECT id, tenant_id, title, stage, brief, created_at
         FROM pipeline.pipeline_run
        WHERE id = $1`,
      [runId],
    );
    return rows[0] ?? null;
  });
  if (!run) return null;

  const assets = await withTx(async (client) => {
    const { rows } = await client.query<AssetRow>(
      `SELECT name, kind, meta
         FROM pipeline.asset
        WHERE run_id = $1
        ORDER BY created_at ASC`,
      [runId],
    );
    return rows;
  });

  return { run, assets };
}

/** Costruisce la pagina pubblica del sito a partire dai deliverable reali. */
export async function renderSitePage(runId: string): Promise<SitePage | null> {
  const loaded = await loadSiteRun(runId);
  if (!loaded) return null;

  const contents = loaded.assets.map((asset) => ({ name: asset.name, content: assetContent(asset.meta) }));
  const copyDoc = contents.find((c) => /copy/i.test(c.name))?.content ?? "";
  const sitemapDoc = contents.find((c) => /sitemap|wireframe/i.test(c.name))?.content ?? "";
  const seoDoc = contents.find((c) => /seo/i.test(c.name))?.content ?? "";

  const sections = parseCopySections(copyDoc);
  if (sections.length === 0) return null;

  const hero = sections.find((s) => /^home$/i.test(s.page)) ?? sections[0];
  const nav = parseNav(sitemapDoc);
  const seo = parseSeo(seoDoc);
  const brand = brandFromTitle(loaded.run.title);

  const title = seo.title || hero.heading || loaded.run.title;
  const description = seo.description || hero.intro || "";

  return {
    runId,
    title,
    description,
    html: renderHtml({
      brand,
      title,
      description,
      nav: nav.length ? nav : sections.map((s) => s.page),
      hero,
      sections,
      runId,
    }),
  };
}

export interface SiteLeadInput {
  name?: string;
  email?: string;
  phone?: string;
  message?: string;
  website?: string;
  utm?: Record<string, unknown>;
  payload?: Record<string, unknown>;
}

const EMAIL_RE = /^[^@\s]+@[^@\s.]+\.[^@\s]+$/;

/**
 * Crea un lead per il sito pubblicato del run e lo inoltra al canale outbound
 * (Slack). Il tenant e' quello del run: il visitatore del sito non ha
 * sessione, il lead resta pero' attribuito al cliente che ha commissionato il
 * sito.
 */
export async function createSiteLead(
  runId: string,
  input: SiteLeadInput,
): Promise<{ id: string; tenantId: string } | null> {
  const loaded = await loadSiteRun(runId);
  if (!loaded) return null;

  const name = (input.name ?? "").trim().slice(0, 200);
  const email = (input.email ?? "").trim().slice(0, 200);
  const phone = (input.phone ?? "").trim().slice(0, 60);
  const message = (input.message ?? "").trim().slice(0, 4000);

  if (!EMAIL_RE.test(email)) {
    throw new Error("Inserisci un indirizzo email valido");
  }

  const { createLead, getLead, markLeadNotified } = await import("../pipeline/repo.js");
  const created = await createLead({
    tenantId: loaded.run.tenant_id,
    runId,
    source: "website",
    name: name || null,
    email,
    phone: phone || null,
    message: message || null,
    utm: input.utm ?? {},
    payload: input.payload ?? {},
  });

  const { notifyLeadCreated } = await import("../pipeline/notify.js");
  const lead = await getLead(loaded.run.tenant_id, created.id);
  if (lead) {
    const notified = await notifyLeadCreated(loaded.run.tenant_id, lead).catch(() => ({
      sent: false,
      channel: null,
    }));
    if (notified.sent) {
      await markLeadNotified(loaded.run.tenant_id, lead.id).catch(() => undefined);
    }
  }

  return { id: created.id, tenantId: loaded.run.tenant_id };
}
