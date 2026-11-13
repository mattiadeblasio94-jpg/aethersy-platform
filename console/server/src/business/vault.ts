// =============================================================================
// "Memoria costruttiva" in stile Obsidian.
//
// Ogni voce di `business.memory` e' un file markdown con:
//   - un percorso nel vault (`path`, es. "Progetti/Aethersy/launch.md");
//   - dei collegamenti wiki `[[Titolo]]` nel contenuto, estratti in automatico.
//
// Il vault e' del tenant: niente lock-in, i file sono esportabili e leggibili
// da qualsiasi editor. Jarvis (e l'agente di codice) leggono e scrivono qui
// per costruire contesto senza reinventare la conoscenza.
// =============================================================================

const WIKILINK = /\[\[([^\[\]|#]+)(?:[|#][^\[\]]*)?\]\]/g;

/** Estrae i titoli dei collegamenti wiki presenti nel contenuto (unici, ordine di prima apparizione). */
export function extractWikiLinks(content: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const match of content.matchAll(WIKILINK)) {
    const title = (match[1] ?? "").trim();
    if (!title) continue;
    const key = title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(title);
  }
  return out;
}

/** Slug filesystem-safe per un titolo (accenti translitterati in ASCII). */
export function slugify(title: string): string {
  const slug = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return slug || "nota";
}

/**
 * Calcola il percorso del file nel vault.
 * - path esplicito -> normalizzato (slash, niente `..`, estensione `.md`).
 * - altrimenti -> `Note/<slug>.md` (cartella predefinita, stile Obsidian).
 */
export function vaultPath(explicitPath: string | undefined | null, title: string): string {
  const raw = (explicitPath ?? "").trim();
  if (!raw) return `Note/${slugify(title)}.md`;
  const cleaned = raw
    .replace(/\\/g, "/")
    .split("/")
    .filter((seg) => seg && seg !== "." && seg !== "..")
    .join("/");
  if (!cleaned) return `Note/${slugify(title)}.md`;
  return cleaned.toLowerCase().endsWith(".md") ? cleaned : `${cleaned}.md`;
}

/** Nome del file (ultimo segmento del percorso). */
export function vaultFileName(path: string): string {
  const segments = path.split("/").filter(Boolean);
  return segments[segments.length - 1] ?? "nota.md";
}
