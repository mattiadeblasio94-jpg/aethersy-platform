// Catalogo della piattaforma "Business Pulse": il modello di prodotto derivato
// da pazi.ai (Business Pulse, Opportunities, Tasks & Calendar, Agent Roster,
// Inbox, Files, Account) mappato 1:1 sulle superfici REALI gia' presenti in
// Aethersy (pipeline_run, agent_task, asset, lead, metering).
//
// Puro e senza dipendenze: e' la fonte unica di verita' per le etichette di
// stato mostrate dalla Console e per il roster degli specialisti. Nessun dato
// qui: solo la mappa fra i concetti pazi e le entita' Aethersy.
// Riferimento: docs/platform-consumption.md sez. 5.

import type { RunStatus } from "../pipeline/catalog.js";

// --- Roster degli specialisti (droids in ~/.factory/droids) ------------------

export interface DroidProfile {
  id: string;
  name: string;
  role: string;
  /** Reparto di appartenenza (per il raggruppamento in Console). */
  department: "Product" | "Engineering" | "Design" | "Growth" | "Data" | "Quality" | "Ops" | "Security" | "Support";
  /** Una riga di posizionamento, dal prompt del droid. */
  tagline: string;
  /** Competenze chiave mostrate nella scheda agente. */
  skills: string[];
  /** Stadi della pipeline in cui il droid e' tipicamente impiegato. */
  stages: string[];
}

/**
 * Roster dei 12 specialisti operativi (droid di prodotto). Gli agenti di
 * revisione (code-quality, security, performance, ...) non sono in elenco: sono
 * strumenti di qualita' interna, non reparti di prodotto.
 */
export const DROIDS: DroidProfile[] = [
  {
    id: "compass",
    name: "Compass",
    role: "Product Manager",
    department: "Product",
    tagline: "Trasforma gli obiettivi in lavoro chiaro e ordinato.",
    skills: ["Roadmap", "User story", "Priorita'", "Criteri di accettazione"],
    stages: ["brand", "website", "content", "social"],
  },
  {
    id: "atlas",
    name: "Atlas",
    role: "Platform / Backend Engineer",
    department: "Engineering",
    tagline: "Costruisce e mantiene il motore di automazione.",
    skills: ["Activepieces", "API REST", "Postgres/Redis", "Docker"],
    stages: ["social"],
  },
  {
    id: "forge",
    name: "Forge",
    role: "Web Frontend Developer",
    department: "Engineering",
    tagline: "Esperienze web di precisione cristallina.",
    skills: ["React", "CSS", "Accessibilita'", "Performance"],
    stages: ["website"],
  },
  {
    id: "prism",
    name: "Prism",
    role: "Brand & Design System",
    department: "Design",
    tagline: "Custodisce l'identita' visiva: ogni superficie rifrange la stessa luce.",
    skills: ["Design token", "UI kit", "Tipografia", "Asset"],
    stages: ["brand", "website", "social"],
  },
  {
    id: "quill",
    name: "Quill",
    role: "Content & Copy",
    department: "Design",
    tagline: "La voce scritta: chiarezza prima di tutto, poi stile.",
    skills: ["Copy prodotto", "Documentazione", "Tone of voice"],
    stages: ["brand", "website", "content", "social"],
  },
  {
    id: "beacon",
    name: "Beacon",
    role: "Growth & Marketing",
    department: "Growth",
    tagline: "Sistemi che portano traffico qualificato e lo convertono.",
    skills: ["SEO tecnico", "Funnel", "Tracking", "Automazioni"],
    stages: ["website", "content", "social"],
  },
  {
    id: "lens",
    name: "Lens",
    role: "Data & Analytics",
    department: "Data",
    tagline: "Un numero senza contesto e' rumore.",
    skills: ["Modellazione dati", "SQL", "Metriche", "Dashboard"],
    stages: ["content"],
  },
  {
    id: "scout",
    name: "Scout",
    role: "Research & Intelligence",
    department: "Data",
    tagline: "Gli occhi sul mondo esterno: fatti, non opinioni.",
    skills: ["Ricerca", "Benchmark", "Valutazione librerie", "Fonti"],
    stages: ["brand", "content"],
  },
  {
    id: "probe",
    name: "Probe",
    role: "QA & Test Engineer",
    department: "Quality",
    tagline: "Se non e' verificato, non e' fatto.",
    skills: ["Piani di test", "Unit/Integration/E2E", "Riproduzione bug"],
    stages: ["website", "social"],
  },
  {
    id: "orbit",
    name: "Orbit",
    role: "DevOps / SRE",
    department: "Ops",
    tagline: "Infrastruttura e affidabilita', in sicurezza e riproducibile.",
    skills: ["Docker", "Caddy TLS", "Backup/restore", "Monitoraggio"],
    stages: ["website"],
  },
  {
    id: "vault",
    name: "Vault",
    role: "Security Engineer",
    department: "Security",
    tagline: "Riduce la superficie d'attacco e protegge dati e credenziali.",
    skills: ["Threat modeling", "OWASP", "Igiene dei segreti", "Auth"],
    stages: ["brand"],
  },
  {
    id: "echo",
    name: "Echo",
    role: "Customer Support & Success",
    department: "Support",
    tagline: "Il punto di contatto con gli utenti: risolve, spiega, riporta.",
    skills: ["FAQ", "Troubleshooting", "Knowledge base", "Feedback"],
    stages: ["social"],
  },
];

export function droidProfile(id: string): DroidProfile | null {
  return DROIDS.find((d) => d.id === id) ?? null;
}

// --- Mappa di stato pazi.ai -> Aethersy --------------------------------------

/**
 * Stato "Opportunity" (modello pazi.ai) derivato dallo stato reale del run.
 * E' solo presentazione: nessuna transizione nuova, la macchina a stati resta
 * quella di `pipeline/catalog.ts`.
 */
export type OpportunityState =
  | "open"
  | "in_progress"
  | "awaiting_input"
  | "ready"
  | "done"
  | "error";

export interface OpportunityStateMeta {
  state: OpportunityState;
  label: string;
  /** Tono per la UI (mappa sui colori del design system). */
  tone: "neutral" | "info" | "warning" | "success" | "danger";
  /** Richiede un'azione umana (approvazione) per procedere? */
  needsHuman: boolean;
}

const RUN_TO_OPPORTUNITY: Record<RunStatus, OpportunityStateMeta> = {
  draft: { state: "open", label: "Aperta", tone: "neutral", needsHuman: false },
  in_progress: { state: "in_progress", label: "In corso", tone: "info", needsHuman: false },
  in_review: { state: "awaiting_input", label: "In attesa di input", tone: "warning", needsHuman: true },
  approved: { state: "ready", label: "Pronta", tone: "success", needsHuman: false },
  delivered: { state: "done", label: "Consegnata", tone: "success", needsHuman: false },
  failed: { state: "error", label: "Errore", tone: "danger", needsHuman: false },
};

export function opportunityState(status: RunStatus): OpportunityStateMeta {
  return RUN_TO_OPPORTUNITY[status] ?? RUN_TO_OPPORTUNITY.draft;
}

/** Ordine di priorita' con cui la Console ordina le opportunita' "da fare". */
export const OPPORTUNITY_PRIORITY: OpportunityState[] = [
  "error",
  "awaiting_input",
  "in_progress",
  "ready",
  "open",
  "done",
];

// --- Etichette stato schedule (Tasks & Calendar) -----------------------------

export type ScheduleStatus = "scheduled" | "paused" | "done" | "canceled";
export type ScheduleKind = "pipeline" | "social" | "report" | "reminder";

export const SCHEDULE_STATUSES: ScheduleStatus[] = ["scheduled", "paused", "done", "canceled"];
export const SCHEDULE_KINDS: ScheduleKind[] = ["pipeline", "social", "report", "reminder"];

export const SCHEDULE_KIND_LABELS: Record<ScheduleKind, string> = {
  pipeline: "Pipeline",
  social: "Social",
  report: "Report",
  reminder: "Promemoria",
};

export function isScheduleStatus(value: string): value is ScheduleStatus {
  return (SCHEDULE_STATUSES as string[]).includes(value);
}

export function isScheduleKind(value: string): value is ScheduleKind {
  return (SCHEDULE_KINDS as string[]).includes(value);
}
