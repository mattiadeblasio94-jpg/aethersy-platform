// =============================================================================
// Rotte dell'area autenticata. Qui si associa ogni percorso al componente reale
// della pagina, caricato in modo lazy (React.lazy) cosi' il bundle iniziale
// resta piccolo e ogni route porta solo il proprio codice. Titolo e descrizione
// restano in un unico elenco, usato dalla sotto-navigazione e dai meta.
// =============================================================================

import { lazy } from "react";
import type { ComponentType } from "react";

// Caricamento differito: un chunk per pagina (vedi anche manualChunks in
// vite.config.ts per i vendor condivisi).
const Pulse = lazy(() => import("./Pulse"));
const Studio = lazy(() => import("./Studio"));
const Agents = lazy(() => import("./Agents"));
const AgentCreate = lazy(() => import("./AgentCreate"));
const AgentDetail = lazy(() => import("./AgentDetail"));
const AgentLogs = lazy(() => import("./AgentLogs"));
const SocialMedia = lazy(() => import("./SocialMedia"));
const SocialPlatformDetail = lazy(() => import("./SocialPlatformDetail"));
const Tasks = lazy(() => import("./Tasks"));
const Outreach = lazy(() => import("./Outreach"));
const Website = lazy(() => import("./Website"));
const Wix = lazy(() => import("./Wix"));
const Ads = lazy(() => import("./Ads"));
const Products = lazy(() => import("./Products"));
const Analytics = lazy(() => import("./Analytics"));
const SettingsProfile = lazy(() => import("./SettingsProfile"));
const SettingsBilling = lazy(() => import("./SettingsBilling"));
const SettingsIntegrations = lazy(() => import("./SettingsIntegrations"));
const Notifications = lazy(() => import("./Notifications"));
const SettingsNotifications = lazy(() => import("./SettingsNotifications"));
const Help = lazy(() => import("./Help"));
const Opportunities = lazy(() => import("./Opportunities"));
const Library = lazy(() => import("./Library"));
const Subscription = lazy(() => import("./Subscription"));
const Goals = lazy(() => import("./Goals"));
const Memory = lazy(() => import("./Memory"));
const Inbox = lazy(() => import("./Inbox"));
const ScheduledTasks = lazy(() => import("./ScheduledTasks"));
const ContentCalendar = lazy(() => import("./ContentCalendar"));
const Skills = lazy(() => import("./Skills"));
const Members = lazy(() => import("./Members"));
const Payouts = lazy(() => import("./Payouts"));
const Account = lazy(() => import("./Account"));
const Connectors = lazy(() => import("./Connectors"));
const Research = lazy(() => import("./Research"));
const Specialists = lazy(() => import("./Specialists"));
const Idea = lazy(() => import("./Idea"));
const Guida = lazy(() => import("./Guida"));

export interface RouteSpec {
  path: string;
  title: string;
  description?: string;
  /** Componente della pagina (lazy). */
  component: ComponentType;
}

export const APP_ROUTES: RouteSpec[] = [
  {
    path: "dashboard",
    title: "Home",
    description: "Polso dell'attività: balance, aree dell'attività e feed recente.",
    component: Pulse,
  },
  {
    path: "guida",
    title: "Guida passo-passo",
    description:
      "Il percorso completo della piattaforma in sette passaggi: idea, sito, Wix, business, automazioni, pagamenti, catalogo.",
    component: Guida,
  },
  {
    path: "idea",
    title: "Realizza la tua idea",
    description:
      "Descrivi il risultato che vuoi: la piattaforma crea i reparti, cerca sul web reale e pubblica il sito.",
    component: Idea,
  },
  {
    path: "studio",
    title: "Studio",
    description:
      "La regia degli agenti: scrivi una richiesta e guarda gli specialisti produrre lavoro reale.",
    component: Studio,
  },
  {
    path: "specialisti",
    title: "Specialisti",
    description:
      "I 12 reparti operativi: avvia quello che ti serve e guarda il lavoro reale che produce.",
    component: Specialists,
  },
  {
    path: "research",
    title: "Ricerca",
    description:
      "Ricerca web reale: report citati e fonti cliccabili da usare nel lavoro degli agenti.",
    component: Research,
  },
  {
    path: "agents",
    title: "Agenti",
    description:
      "Gestione completa degli agenti AI: configurazione, scheduling e storico delle esecuzioni.",
    component: Agents,
  },
  {
    path: "agents/create",
    title: "Crea Agente",
    description: "Procedura guidata per configurare un nuovo agente AI.",
    component: AgentCreate,
  },
  {
    path: "agents/:agentId",
    title: "Dettaglio Agente",
    description: "Configurazione, metriche e attivita' di un agente.",
    component: AgentDetail,
  },
  {
    path: "agents/:agentId/logs",
    title: "Log Agente",
    description: "Storico delle esecuzioni di un agente con filtri per livello.",
    component: AgentLogs,
  },
  {
    path: "social-media",
    title: "Social Media",
    description:
      "Calendario editoriale, pianificazione dei contenuti e stato dei collegamenti alle piattaforme.",
    component: SocialMedia,
  },
  {
    path: "social-media/:platform",
    title: "Dettaglio Piattaforma",
    description: "Metriche, contenuti programmati e storico post di una piattaforma.",
    component: SocialPlatformDetail,
  },
  {
    path: "tasks",
    title: "Task",
    description: "Elenco operativo di tutti i task con filtri per stato, agente e priorita'.",
    component: Tasks,
  },
  {
    path: "tasks/active",
    title: "Task attivi",
    description: "Task in attesa o in esecuzione.",
    component: Tasks,
  },
  {
    path: "tasks/scheduled",
    title: "Task programmati",
    description: "Task pianificati per esecuzioni future.",
    component: Tasks,
  },
  {
    path: "tasks/completed",
    title: "Task completati",
    description: "Task conclusi con successo.",
    component: Tasks,
  },
  {
    path: "outreach",
    title: "Outreach",
    description: "Sequenze di contatto, prospect e automazioni di follow-up.",
    component: Outreach,
  },
  {
    path: "website",
    title: "Sito Web",
    description: "Editor delle pagine, landing e catalogo prodotto collegato al brand.",
    component: Website,
  },
  {
    path: "wix",
    title: "Wix",
    description: "Collegamento al server MCP di Wix: e-commerce, blog, analytics e domini del sito.",
    component: Wix,
  },
  {
    path: "ads",
    title: "Annunci",
    description: "Campagne advertising, budget e ottimizzazione del ROAS per canale.",
    component: Ads,
  },
  {
    path: "products",
    title: "Prodotti",
    description: "Catalogo prodotti con prezzi, disponibilita' e stato di pubblicazione.",
    component: Products,
  },
  {
    path: "analytics",
    title: "Analisi",
    description: "KPI unificati, crescita follower e performance dei contenuti per canale.",
    component: Analytics,
  },
  {
    path: "notifications",
    title: "Notifiche",
    description: "Eventi reali: deploy, lead, run consegnate.",
    component: Notifications,
  },
  {
    path: "settings/profile",
    title: "Profilo",
    description: "Dati personali, avatar e preferenze di visualizzazione.",
    component: SettingsProfile,
  },
  {
    path: "settings/billing",
    title: "Fatturazione",
    description: "Piano corrente, crediti, metodo di pagamento e storico fatture.",
    component: SettingsBilling,
  },
  {
    path: "settings/integrations",
    title: "Integrazioni",
    description: "Canali social collegati, chiavi API e webhook.",
    component: SettingsIntegrations,
  },
  {
    path: "settings/notifications",
    title: "Notifiche",
    description: "Canali di notifica e preferenze per piattaforma.",
    component: SettingsNotifications,
  },
  {
    path: "help",
    title: "Aiuto",
    description: "Guide, domande frequenti e canali di supporto.",
    component: Help,
  },
  {
    path: "opportunities",
    title: "Opportunità",
    description: "Kanban board delle opportunità: running, ahead, done.",
    component: Opportunities,
  },
  {
    path: "library",
    title: "Libreria",
    description: "Risorse, agenti, messaggi e inviti del workspace.",
    component: Library,
  },
  {
    path: "subscription",
    title: "Abbonamento",
    description: "Piano, crediti, fatturazione e domande frequenti.",
    component: Subscription,
  },
  {
    path: "goals",
    title: "Obiettivi",
    description: "Obiettivi misurabili del workspace con priorita', metrica e data target.",
    component: Goals,
  },
  {
    path: "memory",
    title: "Memoria",
    description: "Fatti, preferenze, vincoli e decisioni condivisi con gli agenti.",
    component: Memory,
  },
  {
    path: "inbox",
    title: "Inbox",
    description: "Tutte le conversazioni con gli agenti, con invio di nuovi turni.",
    component: Inbox,
  },
  {
    path: "scheduled-tasks",
    title: "Attivita' pianificate",
    description: "Job ricorrenti, prossime esecuzioni e attivita' in corso.",
    component: ScheduledTasks,
  },
  {
    path: "content-calendar",
    title: "Calendario editoriale",
    description: "Contenuti pianificati e pubblicati, per giorno e per stato.",
    component: ContentCalendar,
  },
  {
    path: "skills",
    title: "Competenze",
    description: "Matrice competenze e copertura degli stadi per ogni specialista.",
    component: Skills,
  },
  {
    path: "members",
    title: "Membri",
    description: "Persone e ruoli attivi nel workspace.",
    component: Members,
  },
  {
    path: "payouts",
    title: "Pagamenti e consumi",
    description: "Saldo crediti, riserve e consumo per capability.",
    component: Payouts,
  },
  {
    path: "account",
    title: "Account",
    description: "Tenant, piano, regole di addebito e domande frequenti.",
    component: Account,
  },
  {
    path: "connectors",
    title: "Connettori",
    description:
      "Collega i tuoi account ai provider (Google, GitHub, Slack, Notion, Figma...) con un login reale.",
    component: Connectors,
  },
];

/** Componente associato alla rotta. */
export function componentFor(spec: RouteSpec): ComponentType {
  return spec.component;
}
