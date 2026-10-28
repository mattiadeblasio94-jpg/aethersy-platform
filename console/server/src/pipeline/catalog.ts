// Catalogo degli stadi di pipeline (P0: 4 stadi) e macchine a stati dei job.
// Puro e senza dipendenze: e' la fonte unica di verita' su "cosa fa uno stadio",
// importata dall'orchestratore, dalle rotte e dai test.
// Riferimento: docs/platform-consumption.md sez. 5 (dall'idea al traffico).

export type StageId = "brand" | "website" | "content" | "social";

export type RunStatus =
  | "draft"
  | "in_progress"
  | "in_review"
  | "approved"
  | "delivered"
  | "failed";

export type TaskStatus = "pending" | "running" | "done" | "failed" | "skipped";

export interface StageTaskSpec {
  /** Droid owner dell'unita' di lavoro (roster in ~/.factory/droids). */
  droid: string;
  title: string;
}

export interface StageDeliverableSpec {
  kind: "document" | "image" | "video" | "audio" | "code" | "link" | "dataset" | "archive";
  name: string;
}

export interface StageSpec {
  id: StageId;
  order: number;
  title: string;
  description: string;
  droids: string[];
  tasks: StageTaskSpec[];
  deliverables: StageDeliverableSpec[];
  /** Capability AI dominanti dello stadio (per il manifest di consumo). */
  capabilities: string[];
  intensity: "bassa" | "media" | "alta" | "molto alta";
}

export const STAGES: StageSpec[] = [
  {
    id: "brand",
    order: 3,
    title: "Brand",
    description:
      "Naming, moodboard, palette, tipografia, tone of voice e design system del cliente.",
    droids: ["prism", "quill", "scout", "vault"],
    tasks: [
      { droid: "prism", title: "Moodboard e direzione visiva" },
      { droid: "prism", title: "Palette + tipografia (design token)" },
      { droid: "prism", title: "Logo kit (SVG/PNG/favicon)" },
      { droid: "quill", title: "Tone of voice e linee guida verbali" },
      { droid: "scout", title: "Disponibilita' nome/domini e benchmark" },
      { droid: "vault", title: "Check trademark e fonti (advisory)" },
    ],
    deliverables: [
      { kind: "image", name: "moodboard.png" },
      { kind: "document", name: "palette-tokens.json" },
      { kind: "document", name: "typography-spec.md" },
      { kind: "document", name: "tone-of-voice.md" },
      { kind: "archive", name: "logo-kit.zip" },
      { kind: "document", name: "brand-guidelines.md" },
    ],
    capabilities: ["img_out", "text"],
    intensity: "alta",
  },
  {
    id: "website",
    order: 4,
    title: "Sito / Web",
    description:
      "Sitemap, wireframe, copy, build delle pagine, form lead e SEO on-page di base.",
    droids: ["forge", "quill", "prism", "beacon", "probe", "orbit"],
    tasks: [
      { droid: "forge", title: "Sitemap e wireframe" },
      { droid: "quill", title: "Copy delle pagine" },
      { droid: "prism", title: "Asset visivi del sito" },
      { droid: "forge", title: "Build pagine + form lead" },
      { droid: "beacon", title: "SEO on-page e tracking base" },
      { droid: "probe", title: "Test link, form, accessibilita'" },
      { droid: "orbit", title: "Deploy + TLS" },
    ],
    deliverables: [
      { kind: "document", name: "sitemap.md" },
      { kind: "code", name: "pages" },
      { kind: "document", name: "robots.txt" },
      { kind: "document", name: "sitemap.xml" },
      { kind: "document", name: "tracking-plan.md" },
    ],
    capabilities: ["text", "img_out"],
    intensity: "media",
  },
  {
    id: "content",
    order: 5,
    title: "Contenuti",
    description:
      "Piano editoriale 90 giorni, primo cluster di articoli, mappa keyword e linking interno.",
    droids: ["beacon", "quill", "scout", "lens"],
    tasks: [
      { droid: "beacon", title: "Keyword map e content gap" },
      { droid: "quill", title: "Piano editoriale 90 giorni" },
      { droid: "quill", title: "Cluster 8 articoli (bozze)" },
      { droid: "scout", title: "Fonti verificabili" },
      { droid: "lens", title: "Mappa linking interno" },
    ],
    deliverables: [
      { kind: "document", name: "content-strategy.md" },
      { kind: "document", name: "editorial-calendar-90d.md" },
      { kind: "dataset", name: "articles" },
      { kind: "dataset", name: "internal-linking-map.csv" },
    ],
    capabilities: ["text"],
    intensity: "alta",
  },
  {
    id: "social",
    order: 6,
    title: "Social media",
    description:
      "Calendario 30 giorni, asset statici, reel, caption e coda di pubblicazione schedulata.",
    droids: ["quill", "prism", "beacon", "atlas", "probe", "echo"],
    tasks: [
      { droid: "beacon", title: "Piano editoriale social e orari" },
      { droid: "quill", title: "Caption, hook e hashtag" },
      { droid: "prism", title: "Asset statici del calendario" },
      { droid: "prism", title: "Reel (video brevi)" },
      { droid: "atlas", title: "Coda di pubblicazione schedulata" },
      { droid: "probe", title: "Dry-run della coda" },
      { droid: "echo", title: "Bozze risposte commenti/DM" },
    ],
    deliverables: [
      { kind: "document", name: "social-playbook.md" },
      { kind: "dataset", name: "calendar-30d.csv" },
      { kind: "dataset", name: "social-assets" },
      { kind: "dataset", name: "reels" },
    ],
    capabilities: ["img_out", "vid_out", "tts", "text"],
    intensity: "molto alta",
  },
];

export function stageSpec(id: string): StageSpec | null {
  return STAGES.find((s) => s.id === id) ?? null;
}

// --- Macchina a stati ---------------------------------------------------------

/** Transizioni ammesse di `pipeline_run.status`. */
const RUN_TRANSITIONS: Record<RunStatus, RunStatus[]> = {
  draft: ["in_progress", "failed"],
  in_progress: ["in_review", "failed"],
  in_review: ["approved", "in_progress", "failed"],
  approved: ["delivered", "failed"],
  delivered: [],
  failed: ["in_progress"],
};

export function canTransitionRun(from: RunStatus, to: RunStatus): boolean {
  return (RUN_TRANSITIONS[from] ?? []).includes(to);
}

export function nextRunStatus(from: RunStatus): RunStatus | null {
  const allowed = RUN_TRANSITIONS[from] ?? [];
  return allowed.find((s) => s !== "failed") ?? null;
}

/** Un run e' "chiuso" quando non ammette piu' transizioni. */
export function isRunTerminal(status: RunStatus): boolean {
  return (RUN_TRANSITIONS[status] ?? []).length === 0;
}

/**
 * Stato del run dedotto dai task: tutti `done` => pronto per la review.
 * Puro, cosi' l'orchestratore e i test condividono la stessa regola.
 */
export function derivedRunStatus(tasks: { status: string }[]): "draft" | "in_progress" | "in_review" | "failed" {
  if (!tasks.length) return "draft";
  if (tasks.some((t) => t.status === "failed")) return "failed";
  if (tasks.every((t) => t.status === "done" || t.status === "skipped")) return "in_review";
  if (tasks.some((t) => t.status === "running" || t.status === "done")) return "in_progress";
  return "draft";
}

// --- Asset (libreria deliverable, P0.4) --------------------------------------

export type AssetStatus = "draft" | "in_review" | "approved" | "rejected" | "delivered";

export type AssetKind =
  | "document"
  | "image"
  | "video"
  | "audio"
  | "code"
  | "link"
  | "dataset"
  | "archive";

/**
 * Transizioni ammesse di `asset.status`. Un deliverable nasce `draft`, entra in
 * `in_review` quando l'agente lo propone, e diventa `approved`/`rejected` con la
 * decisione umana (HITL). Un `rejected` puo' essere ripresentato; un `approved`
 * viene marcato `delivered` quando il run e' consegnato. `delivered` e' terminale.
 */
const ASSET_TRANSITIONS: Record<AssetStatus, AssetStatus[]> = {
  draft: ["in_review", "rejected"],
  in_review: ["approved", "rejected", "draft"],
  rejected: ["in_review", "draft"],
  approved: ["delivered", "in_review"],
  delivered: [],
};

export function canTransitionAsset(from: AssetStatus, to: AssetStatus): boolean {
  return (ASSET_TRANSITIONS[from] ?? []).includes(to);
}

/** Solo gli asset in revisione sono decidibili (approva/rifiuta). */
export function isAssetDecidable(status: AssetStatus): boolean {
  return status === "in_review";
}

/** Un asset e' "consegnabile" quando e' approvato (o gia' consegnato). */
export function isAssetAccepted(status: AssetStatus): boolean {
  return status === "approved" || status === "delivered";
}

/** Chiave della "famiglia" di versione: run (o globale) + kind + name. */
export function assetFamilyKey(
  runId: string | null | undefined,
  kind: string,
  name: string,
): string {
  return `${runId ?? "global"}|${kind}|${name}`;
}

/**
 * Versione approvata corrente di una famiglia: l'ultima versione approvata o
 * consegnata. Usata dalla Console per mostrare "cosa e' stato accettato"
 * distinto dall'ultima bozza in lavorazione.
 */
export function approvedVersion<T extends { version: number; status: string }>(
  versions: T[],
): T | null {
  const accepted = versions
    .filter((v) => isAssetAccepted(v.status as AssetStatus))
    .sort((a, b) => b.version - a.version);
  return accepted[0] ?? null;
}

// --- Lead (P0.6) -------------------------------------------------------------

export type LeadStatus = "new" | "contacted" | "qualified" | "won" | "lost" | "spam";

/**
 * Transizioni ammesse di `lead.status`. Un lead entra come `new` e segue un
 * funnel di qualificazione; `won`/`lost`/`spam` sono terminali. `spam` e'
 * raggiungibile da qualunque stato non terminale (filtro in qualunque momento).
 */
const LEAD_TRANSITIONS: Record<LeadStatus, LeadStatus[]> = {
  new: ["contacted", "qualified", "won", "lost", "spam"],
  contacted: ["qualified", "won", "lost", "spam"],
  qualified: ["won", "lost", "spam"],
  won: [],
  lost: [],
  spam: [],
};

export const LEAD_STATUSES: LeadStatus[] = [
  "new",
  "contacted",
  "qualified",
  "won",
  "lost",
  "spam",
];

export function isLeadStatus(value: string): value is LeadStatus {
  return (LEAD_STATUSES as string[]).includes(value);
}

export function canTransitionLead(from: LeadStatus, to: LeadStatus): boolean {
  return (LEAD_TRANSITIONS[from] ?? []).includes(to);
}
