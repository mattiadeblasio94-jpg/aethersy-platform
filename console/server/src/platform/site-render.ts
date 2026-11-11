// platform/site-render.ts — renderer delle pagine pubbliche del sito.
//
// Riceve il documento validato (site-schema.ts) e produce HTML autonomo:
// CSS nel tag <style>, interazione minima (menu mobile, form lead, reveal on
// scroll), accessibilita' (skip link, focus visibile, aria) e meta SEO.
// Niente placeholder: se un'immagine non c'e' il layout si adatta.

import type { SiteDocument, SiteLink, SitePage, SiteSection } from "./site-schema.js";

export interface RenderOptions {
  brandName: string;
  /** URL assoluto del sito (per canonical e condivisione). */
  canonicalBase: string;
  /** Immagini reali del run, in ordine (data URI). */
  images: string[];
  /** Slug del sito (per i link interni). */
  slug: string;
}

const HTML_ENTITIES: Record<string, string> = {
  "&": "&#38;",
  "<": "&#60;",
  ">": "&#62;",
  "\"": "&#34;",
  "'": "'",
};

export function esc(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ENTITIES[char] ?? char);
}

function safeHref(href: string): string {
  if (href.startsWith("#") || href.startsWith("/")) return esc(href);
  if (/^https?:\/\//i.test(href)) return esc(href);
  return "#contatti";
}

function linkHtml(link: SiteLink | null, className: string): string {
  if (!link) return "";
  return `<a class="${className}" href="${safeHref(link.href)}">${esc(link.label)}</a>`;
}

/** Palette di fallback derivata dal nome: sito deterministico e non anonimo. */
function fallbackPalette(name: string): { primary: string; accent: string; background: string } {
  let hash = 0;
  for (let index = 0; index < name.length; index++) {
    hash = (hash * 31 + name.charCodeAt(index)) >>> 0;
  }
  const hue = hash % 360;
  const hue2 = (hue + 42) % 360;
  return {
    primary: `hsl(${hue} 82% 56%)`,
    accent: `hsl(${hue2} 90% 62%)`,
    background: `hsl(${hue} 32% 7%)`,
  };
}

function isColor(value: string): boolean {
  return /^#[0-9a-f]{3,8}$/i.test(value) || /^hsl\(/i.test(value) || /^rgb\(/i.test(value);
}

export function siteCss(brand: SiteDocument["brand"]): string {
  const fallback = fallbackPalette(brand.name);
  const primary = isColor(brand.primary) ? brand.primary : fallback.primary;
  const accent = isColor(brand.accent) ? brand.accent : fallback.accent;
  const background = isColor(brand.background) ? brand.background : fallback.background;
  const secondary = isColor(brand.secondary) ? brand.secondary : accent;
  return `
:root {
  --primary:${primary};
  --accent:${accent};
  --secondary:${secondary};
  --bg:${background};
  --surface:color-mix(in srgb, ${background} 82%, white 18%);
  --surface-2:color-mix(in srgb, ${background} 72%, white 28%);
  --text:#f2f6ff;
  --muted:#a8b4d0;
  --line:color-mix(in srgb, ${primary} 28%, transparent);
  --radius:18px;
  --maxw:1180px;
  --shadow:0 18px 48px rgba(0,0,0,.28);
}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;background:var(--bg);color:var(--text);font-family:Inter,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;line-height:1.65;-webkit-font-smoothing:antialiased}
img{max-width:100%;display:block}
a{color:inherit}
.skip{position:absolute;left:-9999px;top:0;background:var(--primary);color:#04070f;padding:10px 16px;border-radius:0 0 10px 0;font-weight:700;z-index:100}
.skip:focus{left:0}
:focus-visible{outline:3px solid var(--accent);outline-offset:3px;border-radius:6px}
.wrap{max-width:var(--maxw);margin:0 auto;padding:0 22px}
header.site{position:sticky;top:0;z-index:50;backdrop-filter:blur(14px);background:color-mix(in srgb,var(--bg) 86%,transparent);border-bottom:1px solid var(--line)}
.site-bar{display:flex;align-items:center;justify-content:space-between;gap:20px;min-height:72px}
.brand{display:flex;align-items:center;gap:10px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;font-size:.94rem;text-decoration:none}
.brand-mark{width:30px;height:30px;border-radius:9px;background:linear-gradient(135deg,var(--primary),var(--accent));box-shadow:0 0 0 1px color-mix(in srgb,var(--primary) 45%,transparent)}
nav.main{display:flex;gap:4px;align-items:center}
nav.main a{padding:9px 13px;border-radius:999px;color:var(--muted);text-decoration:none;font-size:.92rem;font-weight:500;transition:background .18s,color .18s}
nav.main a:hover{color:var(--text);background:color-mix(in srgb,var(--primary) 16%,transparent)}
nav.main a[aria-current=page]{color:var(--text);background:color-mix(in srgb,var(--primary) 26%,transparent)}
.nav-toggle{display:none;border:1px solid var(--line);background:transparent;color:var(--text);border-radius:10px;padding:8px 11px;cursor:pointer}
section{padding:76px 0;border-bottom:1px solid var(--line)}
section:last-of-type{border-bottom:0}
.eyebrow{color:var(--accent);text-transform:uppercase;letter-spacing:.2em;font-size:.72rem;font-weight:700;margin:0 0 12px}
h1{font-size:clamp(2.1rem,5.4vw,4rem);line-height:1.08;margin:0 0 18px;letter-spacing:-.02em}
h2{font-size:clamp(1.5rem,3vw,2.35rem);line-height:1.18;margin:0 0 14px;letter-spacing:-.01em}
h3{font-size:1.06rem;margin:0 0 8px}
p{margin:0 0 14px;color:var(--muted);max-width:72ch}
.lead{font-size:1.1rem;color:#d8e2f7}
.hero{padding:104px 0 88px;background:radial-gradient(1100px 460px at 12% -12%,color-mix(in srgb,var(--primary) 30%,transparent),transparent 62%),radial-gradient(760px 380px at 92% 8%,color-mix(in srgb,var(--accent) 24%,transparent),transparent 60%)}
.hero-grid{display:grid;grid-template-columns:1.08fr .92fr;gap:52px;align-items:center}
.hero h1{max-width:16ch}
.hero-media{border-radius:calc(var(--radius) + 6px);overflow:hidden;border:1px solid var(--line);box-shadow:var(--shadow);background:var(--surface)}
.hero-media img{width:100%;height:100%;object-fit:cover;aspect-ratio:4/3}
.btn{display:inline-flex;align-items:center;gap:9px;padding:14px 26px;border-radius:999px;border:0;cursor:pointer;font:inherit;font-weight:700;text-decoration:none;background:linear-gradient(120deg,var(--primary),var(--accent));color:#05080f;transition:transform .18s,filter .18s}
.btn:hover{transform:translateY(-2px);filter:brightness(1.07)}
.btn.ghost{background:transparent;color:var(--text);border:1px solid var(--line)}
.actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:26px}
.grid{display:grid;gap:18px;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));margin-top:30px}
.card{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:26px;transition:transform .2s,border-color .2s}
.card:hover{transform:translateY(-4px);border-color:color-mix(in srgb,var(--primary) 55%,transparent)}
.card p{margin:0;font-size:.96rem}
.card .icon{width:42px;height:42px;border-radius:12px;display:grid;place-items:center;margin-bottom:14px;background:color-mix(in srgb,var(--primary) 22%,transparent);color:var(--accent);font-weight:800}
.split{display:grid;grid-template-columns:1fr 1fr;gap:48px;align-items:center}
.split.reverse .split-media{order:-1}
.split-media{border-radius:var(--radius);overflow:hidden;border:1px solid var(--line);box-shadow:var(--shadow)}
.split-media img{width:100%;aspect-ratio:16/10;object-fit:cover}
.checklist{list-style:none;padding:0;margin:20px 0 0;display:grid;gap:11px}
.checklist li{position:relative;padding-left:30px;color:var(--muted)}
.checklist li::before{content:"";position:absolute;left:0;top:8px;width:14px;height:14px;border-radius:50%;background:linear-gradient(135deg,var(--primary),var(--accent))}
.stats{display:grid;gap:18px;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));margin-top:28px}
.stat{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:24px;text-align:center}
.stat b{display:block;font-size:2rem;line-height:1.1;background:linear-gradient(120deg,var(--primary),var(--accent));-webkit-background-clip:text;background-clip:text;color:transparent}
.stat span{color:var(--muted);font-size:.9rem}
.quote{border-left:3px solid var(--accent);padding:8px 0 8px 26px;margin:0;max-width:80ch}
.quote p{font-size:1.18rem;color:var(--text);font-style:italic}
.quote footer{color:var(--muted);font-size:.92rem;margin-top:12px}
.plans{display:grid;gap:18px;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));margin-top:30px}
.plan{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:28px;display:flex;flex-direction:column;gap:14px}
.plan.highlight{border-color:var(--primary);box-shadow:0 0 0 1px color-mix(in srgb,var(--primary) 40%,transparent),var(--shadow)}
.plan .price{font-size:1.9rem;font-weight:800}
.plan ul{margin:0;padding-left:20px;color:var(--muted);display:grid;gap:8px}
.plan .btn{margin-top:auto;justify-content:center}
.faq{max-width:840px;margin-top:24px;display:grid;gap:10px}
.faq details{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:16px 20px}
.faq summary{cursor:pointer;font-weight:600;list-style:none;display:flex;justify-content:space-between;gap:14px}
.faq summary::-webkit-details-marker{display:none}
.faq summary::after{content:"+";color:var(--accent);font-weight:800}
.faq details[open] summary::after{content:"–"}
.faq details p{margin:12px 0 0}
.gallery{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));margin-top:26px}
.gallery figure{margin:0;border-radius:var(--radius);overflow:hidden;border:1px solid var(--line)}
.gallery img{width:100%;aspect-ratio:4/3;object-fit:cover}
.cta-band{background:linear-gradient(120deg,color-mix(in srgb,var(--primary) 26%,transparent),color-mix(in srgb,var(--accent) 18%,transparent));border-block:1px solid var(--line)}
.contact-grid{display:grid;grid-template-columns:1fr 1fr;gap:46px;align-items:start}
form.lead{display:grid;gap:14px;background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:26px}
form.lead label{display:grid;gap:6px;font-size:.9rem;color:var(--muted)}
form.lead input,form.lead textarea{background:color-mix(in srgb,var(--bg) 60%,black 40%);border:1px solid var(--line);border-radius:12px;color:var(--text);padding:12px 14px;font:inherit}
form.lead .full{grid-column:1/-1}
form.lead .hp{position:absolute;left:-9999px}
.form-status{margin:0;min-height:1.3em;font-size:.92rem}
.form-status.ok{color:#4ade80}
.form-status.err{color:#f87171}
footer.site{border-top:1px solid var(--line);padding:38px 0;color:var(--muted);font-size:.9rem}
footer.site .wrap{display:flex;flex-wrap:wrap;gap:16px;justify-content:space-between;align-items:center}
.reveal{opacity:0;transform:translateY(18px);transition:opacity .6s ease,transform .6s ease}
.reveal.in{opacity:1;transform:none}
@media (prefers-reduced-motion:reduce){.reveal{opacity:1;transform:none}html{scroll-behavior:auto}}
@media (max-width:900px){
  .hero-grid,.split,.contact-grid{grid-template-columns:1fr}
  .split.reverse .split-media{order:0}
  .nav-toggle{display:inline-flex}
  nav.main{position:absolute;inset:72px 0 auto;flex-direction:column;align-items:stretch;background:var(--bg);border-bottom:1px solid var(--line);padding:12px 22px 20px;display:none}
  nav.main.open{display:flex}
  section{padding:60px 0}
  .hero{padding:72px 0 60px}
}
`.trim();
}

function renderSection(section: SiteSection, options: RenderOptions, index: number): string {
  const { images } = options;
  const imageAt = (slot: number): string | null => images[slot] ?? null;

  switch (section.type) {
    case "hero": {
      const media = imageAt(0);
      const heroMedia = media
        ? `<div class="hero-media"><img src="${media}" alt="${esc(section.heading || options.brandName)}" loading="eager" /></div>`
        : "";
      return `<section class="hero">
  <div class="wrap hero-grid">
    <div>
      ${section.eyebrow ? `<p class="eyebrow">${esc(section.eyebrow)}</p>` : ""}
      <h1>${esc(section.heading)}</h1>
      ${section.text ? `<p class="lead">${esc(section.text)}</p>` : ""}
      <div class="actions">
        ${linkHtml(section.cta, "btn")}
        ${linkHtml(section.secondaryCta, "btn ghost")}
      </div>
    </div>
    ${heroMedia}
  </div>
</section>`;
    }

    case "features": {
      const cards = section.features
        .map(
          (feature) => `<article class="card reveal">
      <div class="icon">${esc(feature.icon.slice(0, 2) || "•")}</div>
      <h3>${esc(feature.title)}</h3>
      <p>${esc(feature.text)}</p>
    </article>`,
        )
        .join("\n    ");
      const fallback = section.items.length
        ? section.items
            .map(
              (item) => `<article class="card reveal"><h3>${esc(item)}</h3></article>`,
            )
            .join("\n    ")
        : "";
      return `<section><div class="wrap">
  ${section.eyebrow ? `<p class="eyebrow">${esc(section.eyebrow)}</p>` : ""}
  <h2>${esc(section.heading)}</h2>
  ${section.text ? `<p>${esc(section.text)}</p>` : ""}
  <div class="grid">
    ${cards || fallback}
  </div>
</div></section>`;
    }

    case "split": {
      const media = imageAt(index);
      const list = section.items.length
        ? `<ul class="checklist">${section.items.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>`
        : "";
      const mediaHtml = media
        ? `<div class="split-media"><img src="${media}" alt="${esc(section.heading)}" loading="lazy" /></div>`
        : "";
      return `<section><div class="wrap split${section.reverse ? " reverse" : ""}">
  <div>
    ${section.eyebrow ? `<p class="eyebrow">${esc(section.eyebrow)}</p>` : ""}
    <h2>${esc(section.heading)}</h2>
    ${section.text ? `<p class="lead">${esc(section.text)}</p>` : ""}
    ${list}
    <div class="actions">${linkHtml(section.cta, "btn")}</div>
  </div>
  ${mediaHtml}
</div></section>`;
    }

    case "stats": {
      const items = section.stats
        .map(
          (stat) => `<div class="stat reveal"><b>${esc(stat.value)}</b><span>${esc(stat.label)}</span></div>`,
        )
        .join("\n    ");
      return `<section><div class="wrap">
  ${section.eyebrow ? `<p class="eyebrow">${esc(section.eyebrow)}</p>` : ""}
  <h2>${esc(section.heading)}</h2>
  ${section.text ? `<p>${esc(section.text)}</p>` : ""}
  <div class="stats">
    ${items}
  </div>
</div></section>`;
    }

    case "testimonial": {
      const quote = section.testimonial;
      if (!quote) return "";
      return `<section><div class="wrap">
  <blockquote class="quote reveal">
    <p>"${esc(quote.quote)}"</p>
    <footer>${esc(quote.author)}${quote.role ? ` — ${esc(quote.role)}` : ""}</footer>
  </blockquote>
</div></section>`;
    }

    case "pricing": {
      const plans = section.plans
        .map(
          (plan) => `<div class="plan reveal${plan.highlight ? " highlight" : ""}">
    <h3>${esc(plan.name)}</h3>
    <div class="price">${esc(plan.price)}</div>
    <ul>${plan.features.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>
    <a class="btn" href="#contatti">Richiedi informazioni</a>
  </div>`,
        )
        .join("\n  ");
      return `<section><div class="wrap">
  ${section.eyebrow ? `<p class="eyebrow">${esc(section.eyebrow)}</p>` : ""}
  <h2>${esc(section.heading)}</h2>
  ${section.text ? `<p>${esc(section.text)}</p>` : ""}
  <div class="plans">
  ${plans}
  </div>
</div></section>`;
    }

    case "faq": {
      const items = section.faq
        .map((item) => `<details class="reveal"><summary>${esc(item.q)}</summary><p>${esc(item.a)}</p></details>`)
        .join("\n    ");
      return `<section><div class="wrap">
  ${section.eyebrow ? `<p class="eyebrow">${esc(section.eyebrow)}</p>` : ""}
  <h2>${esc(section.heading)}</h2>
  ${section.text ? `<p>${esc(section.text)}</p>` : ""}
  <div class="faq">
    ${items}
  </div>
</div></section>`;
    }

    case "gallery": {
      const galleryImages = images.slice(index).slice(0, 6);
      if (galleryImages.length === 0) return "";
      const figures = galleryImages
        .map(
          (image, position) => `<figure class="reveal"><img src="${image}" alt="${esc(section.heading)} ${position + 1}" loading="lazy" /></figure>`,
        )
        .join("\n      ");
      return `<section><div class="wrap">
  ${section.eyebrow ? `<p class="eyebrow">${esc(section.eyebrow)}</p>` : ""}
  <h2>${esc(section.heading)}</h2>
  ${section.text ? `<p>${esc(section.text)}</p>` : ""}
  <div class="gallery">
      ${figures}
  </div>
</div></section>`;
    }

    case "cta": {
      return `<section class="cta-band"><div class="wrap">
  ${section.eyebrow ? `<p class="eyebrow">${esc(section.eyebrow)}</p>` : ""}
  <h2>${esc(section.heading)}</h2>
  ${section.text ? `<p class="lead">${esc(section.text)}</p>` : ""}
  <div class="actions">${linkHtml(section.cta, "btn")}${linkHtml(section.secondaryCta, "btn ghost")}</div>
</div></section>`;
    }

    default:
      return `<section><div class="wrap">
  ${section.eyebrow ? `<p class="eyebrow">${esc(section.eyebrow)}</p>` : ""}
  <h2>${esc(section.heading)}</h2>
  ${section.text ? `<p class="lead">${esc(section.text)}</p>` : ""}
  ${section.items.length ? `<ul class="checklist">${section.items.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>` : ""}
  <div class="actions">${linkHtml(section.cta, "btn")}</div>
</div></section>`;
  }
}

function renderNav(document: SiteDocument, current: SitePage, options: RenderOptions): string {
  const links = document.pages
    .map((page) => {
      const href = page.slug === "home" ? `/s/${options.slug}` : `/s/${options.slug}/${page.slug}`;
      const currentAttr = page.slug === current.slug ? ' aria-current="page"' : "";
      return `<a href="${esc(href)}"${currentAttr}>${esc(page.navLabel)}</a>`;
    })
    .join("");
  return `<nav class="main" id="site-nav" aria-label="Navigazione principale">${links}</nav>`;
}

function renderContact(document: SiteDocument, options: RenderOptions): string {
  const contact = document.contact;
  const contactDetails = [
    contact.email ? `<p>Email: <a href="mailto:${esc(contact.email)}">${esc(contact.email)}</a></p>` : "",
    contact.phone ? `<p>Telefono: <a href="tel:${esc(contact.phone.replace(/[^\d+]/g, ""))}">${esc(contact.phone)}</a></p>` : "",
    contact.address ? `<p>${esc(contact.address)}</p>` : "",
  ]
    .filter(Boolean)
    .join("\n      ");
  return `<section id="contatti"><div class="wrap contact-grid">
  <div>
    <p class="eyebrow">Contatti</p>
    <h2>${esc(contact.heading)}</h2>
    ${contact.text ? `<p class="lead">${esc(contact.text)}</p>` : ""}
    ${contactDetails}
  </div>
  <form class="lead" id="lead-form" method="post" action="/s/${esc(options.slug)}/lead">
    <label>Nome<input type="text" name="name" autocomplete="name" maxlength="120" /></label>
    <label>Email<input type="email" name="email" autocomplete="email" required maxlength="160" /></label>
    <label class="hp" aria-hidden="true">Sito web<input type="text" name="website" tabindex="-1" autocomplete="off" /></label>
    <label class="full">Messaggio<textarea name="message" rows="4" maxlength="2000"></textarea></label>
    <button class="btn" type="submit">Invia richiesta</button>
    <p class="form-status full" id="lead-status" role="status"></p>
  </form>
</div></section>`;
}

/** HTML completo di una pagina del sito. */
export function renderSitePageHtml(
  document: SiteDocument,
  page: SitePage,
  options: RenderOptions,
): string {
  const body = page.sections
    .map((section, index) => renderSection(section, options, index))
    .filter(Boolean)
    .join("\n");
  const title = page.seoTitle || `${page.title} | ${document.brand.name}`;
  const description = page.seoDescription || document.brand.tagline || "";
  const canonical = `${options.canonicalBase}/s/${options.slug}${page.slug === "home" ? "" : `/${page.slug}`}`;

  return `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}" />
<link rel="canonical" href="${esc(canonical)}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="${esc(document.brand.name)}" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:url" content="${esc(canonical)}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="theme-color" content="${esc(document.brand.primary || "#00d4ff")}" />
<style>${siteCss(document.brand)}</style>
</head>
<body>
<a class="skip" href="#main">Vai al contenuto</a>
<header class="site">
  <div class="wrap site-bar">
    <a class="brand" href="/s/${esc(options.slug)}"><span class="brand-mark" aria-hidden="true"></span>${esc(document.brand.name)}</a>
    <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="site-nav">Menu</button>
    ${renderNav(document, page, options)}
  </div>
</header>
<main id="main">
${body}
${renderContact(document, options)}
</main>
<footer class="site">
  <div class="wrap">
    <span>&copy; ${new Date().getFullYear()} ${esc(document.brand.name)}</span>
    <span>Realizzato con Aethersy</span>
  </div>
</footer>
<script>
(function () {
  var toggle = document.querySelector(".nav-toggle");
  var nav = document.getElementById("site-nav");
  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }
  var reveals = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && reveals.length) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) { entry.target.classList.add("in"); io.unobserve(entry.target); }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add("in"); });
  }
  var form = document.getElementById("lead-form");
  var status = document.getElementById("lead-status");
  if (form && status) {
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var data = new FormData(form);
      var payload = {
        name: String(data.get("name") || ""),
        email: String(data.get("email") || ""),
        message: String(data.get("message") || ""),
        website: String(data.get("website") || "")
      };
      status.className = "form-status full";
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
          status.className = "form-status full ok";
          status.textContent = out.body && out.body.message ? out.body.message : "Richiesta inviata. Rispondiamo entro 24 ore.";
        } else {
          status.className = "form-status full err";
          status.textContent = out.body && out.body.message ? out.body.message : "Invio non riuscito. Riprova.";
        }
      }).catch(function () {
        status.className = "form-status full err";
        status.textContent = "Invio non riuscito. Controlla la connessione e riprova.";
      });
    });
  }
})();
</script>
</body>
</html>`;
}
