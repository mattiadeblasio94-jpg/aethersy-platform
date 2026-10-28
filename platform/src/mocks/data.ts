// =============================================================================
// Mock layer (Stadio A). Dati realistici e tipizzati che alimentano l'app
// finche' i backend reali (social/agents/tasks/analytics, brief §7) non esistono.
//
// Zero segreti: nessun token, nessuna chiave, nessun dato di produzione.
// =============================================================================

import type {
  Agent,
  Campaign,
  DashboardStat,
  LandingContent,
  Notification,
  Platform,
  PlatformAnalytics,
  PlatformId,
  Product,
  Task,
  User,
  Workspace,
} from "@/lib/types";

// --- Helper deterministici -------------------------------------------------

/** Data ISO relativa a "adesso" (offset negativo = passato), in minuti. */
function isoAgo(minutesAgo: number): string {
  return new Date(Date.now() - minutesAgo * 60_000).toISOString();
}

function isoInDays(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

function isoAgoDays(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

// --- Workspaces ------------------------------------------------------------

export const workspaces: Workspace[] = [
  {
    id: "ws-aethersy",
    name: "Aethersy Studio",
    businessType: "Agenzia digitale",
    plan: "pro",
    logo: "/brand/logo-192.png",
  },
  {
    id: "ws-cliente-nord",
    name: "Nord Retail",
    businessType: "E-commerce",
    plan: "starter",
  },
  {
    id: "ws-ente-sud",
    name: "Sud Cultura",
    businessType: "Associazione no-profit",
    plan: "starter",
  },
];

// --- Piattaforme -----------------------------------------------------------

export const platforms: Platform[] = [
  {
    id: "instagram",
    name: "Instagram",
    status: "connected",
    accountName: "@aethersy.studio",
    avatar: "/brand/logo-192.png",
    stats: { posts: 128, followers: 18450 },
    icon: "/icons/instagram.svg",
    color: "#E1306C",
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    status: "connected",
    accountName: "Aethersy Studio",
    avatar: "/brand/logo-192.png",
    stats: { posts: 74, followers: 9320 },
    icon: "/icons/linkedin.svg",
    color: "#0A66C2",
  },
  {
    id: "youtube",
    name: "YouTube",
    status: "connected",
    accountName: "Aethersy Channel",
    avatar: "/brand/logo-192.png",
    stats: { posts: 36, followers: 6470 },
    icon: "/icons/youtube.svg",
    color: "#FF0000",
  },
  {
    id: "tiktok",
    name: "TikTok",
    status: "pending",
    accountName: "@aethersy",
    stats: { posts: 0, followers: 0 },
    icon: "/icons/tiktok.svg",
    color: "#25F4EE",
  },
  {
    id: "x",
    name: "X",
    status: "disconnected",
    stats: { posts: 0, followers: 0 },
    icon: "/icons/x.svg",
    color: "#FFFFFF",
  },
  {
    id: "facebook",
    name: "Facebook",
    status: "disconnected",
    stats: { posts: 0, followers: 0 },
    icon: "/icons/facebook.svg",
    color: "#1877F2",
  },
];

// --- Agenti ----------------------------------------------------------------

export const agents: Agent[] = [
  {
    id: "agent-social-curator",
    name: "Social Curator",
    type: "social",
    status: "active",
    description:
      "Pianifica e pubblica contenuti su Instagram, LinkedIn e YouTube con cadenza ottimizzata.",
    lastRun: isoAgo(42),
    tasksCompleted: 312,
    targetPlatforms: ["instagram", "linkedin", "youtube"],
  },
  {
    id: "agent-content-writer",
    name: "Content Writer",
    type: "content",
    status: "active",
    description:
      "Genera caption, script e descrizioni coerenti con il tono del brand.",
    lastRun: isoAgo(90),
    tasksCompleted: 187,
    targetPlatforms: ["instagram", "linkedin", "tiktok"],
  },
  {
    id: "agent-outreach-pro",
    name: "Outreach Pro",
    type: "outreach",
    status: "paused",
    description:
      "Identifica prospect e invia sequenze di contatto personalizzate su LinkedIn.",
    lastRun: isoAgoDays(3),
    tasksCompleted: 64,
    targetPlatforms: ["linkedin"],
  },
  {
    id: "agent-analytics-eye",
    name: "Analytics Eye",
    type: "analytics",
    status: "active",
    description:
      "Monitora i KPI delle piattaforme e produce report settimanali.",
    lastRun: isoAgo(180),
    tasksCompleted: 96,
    targetPlatforms: ["instagram", "linkedin", "youtube"],
  },
  {
    id: "agent-ads-pilot",
    name: "Ads Pilot",
    type: "ads",
    status: "error",
    description:
      "Ottimizza i budget delle campagne Meta e TikTok in base al ROAS.",
    lastRun: isoAgo(320),
    tasksCompleted: 41,
    targetPlatforms: ["instagram", "facebook", "tiktok"],
  },
];

// --- Task ------------------------------------------------------------------

export const tasks: Task[] = [
  {
    id: "task-1",
    title: "Pubblicare carosello 'Novita' prodotto su Instagram",
    agentId: "agent-social-curator",
    agentName: "Social Curator",
    platform: "instagram",
    status: "completed",
    date: isoAgo(35),
    priority: "high",
    type: "post",
    durationMs: 4_120,
  },
  {
    id: "task-2",
    title: "Scrivere newsletter mensile",
    agentId: "agent-content-writer",
    agentName: "Content Writer",
    platform: "linkedin",
    status: "completed",
    date: isoAgo(120),
    priority: "medium",
    type: "content",
    durationMs: 8_640,
  },
  {
    id: "task-3",
    title: "Report settimanale KPI",
    agentId: "agent-analytics-eye",
    agentName: "Analytics Eye",
    platform: "youtube",
    status: "completed",
    date: isoAgo(190),
    priority: "low",
    type: "report",
    durationMs: 2_310,
  },
  {
    id: "task-4",
    title: "Ottimizzare budget campagna retargeting",
    agentId: "agent-ads-pilot",
    agentName: "Ads Pilot",
    platform: "facebook",
    status: "failed",
    date: isoAgo(320),
    priority: "high",
    type: "ads",
    durationMs: 11_480,
  },
  {
    id: "task-5",
    title: "Selezionare 50 prospect per outreach",
    agentId: "agent-outreach-pro",
    agentName: "Outreach Pro",
    platform: "linkedin",
    status: "running",
    date: isoAgo(8),
    priority: "medium",
    type: "outreach",
  },
  {
    id: "task-6",
    title: "Pianificare reel per la prossima settimana",
    agentId: "agent-social-curator",
    agentName: "Social Curator",
    platform: "tiktok",
    status: "scheduled",
    date: isoInDays(2),
    priority: "medium",
    type: "post",
  },
  {
    id: "task-7",
    title: "Aggiornare descrizione video YouTube",
    agentId: "agent-content-writer",
    agentName: "Content Writer",
    platform: "youtube",
    status: "pending",
    date: isoInDays(1),
    priority: "low",
    type: "content",
  },
  {
    id: "task-8",
    title: "Analisi competitor settore retail",
    agentId: "agent-analytics-eye",
    agentName: "Analytics Eye",
    platform: "x",
    status: "pending",
    date: isoInDays(3),
    priority: "medium",
    type: "analysis",
  },
  {
    id: "task-9",
    title: "Scrivere 5 caption per il lancio estivo",
    agentId: "agent-content-writer",
    agentName: "Content Writer",
    platform: "instagram",
    status: "running",
    date: isoAgo(14),
    priority: "high",
    type: "content",
  },
  {
    id: "task-10",
    title: "Pubblicare story sondaggio prodotto",
    agentId: "agent-social-curator",
    agentName: "Social Curator",
    platform: "instagram",
    status: "completed",
    date: isoAgo(280),
    priority: "low",
    type: "post",
    durationMs: 1_980,
  },
  {
    id: "task-11",
    title: "Sincronizzare metriche LinkedIn",
    agentId: "agent-analytics-eye",
    agentName: "Analytics Eye",
    platform: "linkedin",
    status: "completed",
    date: isoAgo(410),
    priority: "medium",
    type: "analysis",
    durationMs: 3_450,
  },
  {
    id: "task-12",
    title: "Inviare sequenza follow-up prospect",
    agentId: "agent-outreach-pro",
    agentName: "Outreach Pro",
    platform: "linkedin",
    status: "scheduled",
    date: isoInDays(1),
    priority: "high",
    type: "outreach",
  },
  {
    id: "task-13",
    title: "Analizzare performance creativita' Meta",
    agentId: "agent-ads-pilot",
    agentName: "Ads Pilot",
    platform: "facebook",
    status: "completed",
    date: isoAgo(520),
    priority: "medium",
    type: "ads",
    durationMs: 6_780,
  },
  {
    id: "task-14",
    title: "Riscrivere meta description pagine sito",
    agentId: "agent-content-writer",
    agentName: "Content Writer",
    platform: "x",
    status: "failed",
    date: isoAgo(600),
    priority: "low",
    type: "content",
    durationMs: 9_120,
  },
];

// --- Statistiche dashboard -------------------------------------------------

export const dashboardStats: DashboardStat[] = [
  {
    id: "stat-platforms",
    label: "Piattaforme connesse",
    value: "3/6",
    delta: "+1 questa settimana",
    trend: "up",
    icon: "platforms",
  },
  {
    id: "stat-agents",
    label: "Agenti attivi",
    value: "2/5",
    delta: "-1 in pausa",
    trend: "down",
    icon: "agents",
  },
  {
    id: "stat-tasks",
    label: "Task oggi",
    value: "47",
    delta: "+18% vs ieri",
    trend: "up",
    icon: "tasks",
  },
  {
    id: "stat-credits",
    label: "Crediti disponibili",
    value: "1.250",
    delta: "Stima 12 giorni",
    trend: "flat",
    icon: "credits",
  },
];

// --- Analytics -------------------------------------------------------------

const weeklyLabels = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

export const analytics: PlatformAnalytics[] = [
  {
    platform: "instagram",
    total: 48200,
    growth: 12.4,
    points: weeklyLabels.map((label, i) => ({
      label,
      date: isoAgoDays(6 - i),
      value: [1420, 1680, 1590, 2040, 2310, 1980, 2560][i],
    })),
  },
  {
    platform: "linkedin",
    total: 18740,
    growth: 8.1,
    points: weeklyLabels.map((label, i) => ({
      label,
      date: isoAgoDays(6 - i),
      value: [620, 710, 680, 820, 940, 760, 1010][i],
    })),
  },
  {
    platform: "youtube",
    total: 9630,
    growth: -2.3,
    points: weeklyLabels.map((label, i) => ({
      label,
      date: isoAgoDays(6 - i),
      value: [410, 380, 360, 420, 390, 350, 330][i],
    })),
  },
];

// --- Prodotti --------------------------------------------------------------

export const products: Product[] = [
  {
    id: "prod-1",
    name: "Kit Social Starter",
    description: "Template e calendario editoriale pronti all'uso.",
    price: 49,
    currency: "EUR",
    status: "active",
    stock: 999,
    category: "Template",
    sold: 1284,
    rating: 4.8,
  },
  {
    id: "prod-2",
    name: "Report Analytics Pro",
    description: "Dashboard personalizzata con KPI multi-piattaforma.",
    price: 129,
    currency: "EUR",
    status: "active",
    stock: 999,
    category: "Analytics",
    sold: 642,
    rating: 4.6,
  },
  {
    id: "prod-3",
    name: "Setup Ads Guidato",
    description: "Configurazione campagne Meta e TikTok con budget ottimizzato.",
    price: 249,
    currency: "EUR",
    status: "draft",
    stock: 12,
    category: "Servizi",
    sold: 318,
    rating: 4.4,
  },
  {
    id: "prod-4",
    name: "Calendario Editoriale Mensile",
    description: "30 idee di contenuto pronte da personalizzare.",
    price: 39,
    currency: "EUR",
    status: "active",
    stock: 999,
    category: "Template",
    sold: 986,
    rating: 4.7,
  },
  {
    id: "prod-5",
    name: "Audit SEO Completo",
    description: "Analisi tecnica del sito con piano di intervento prioritario.",
    price: 189,
    currency: "EUR",
    status: "active",
    stock: 40,
    category: "SEO",
    sold: 154,
    rating: 4.5,
  },
  {
    id: "prod-6",
    name: "Playbook Outreach",
    description: "Sequenze email e LinkedIn testate per il B2B.",
    price: 79,
    currency: "EUR",
    status: "archived",
    stock: 0,
    category: "Servizi",
    sold: 88,
    rating: 4.1,
  },
  {
    id: "prod-7",
    name: "Template Reel 30 Giorni",
    description: "Format e hook per reel ad alta retention.",
    price: 59,
    currency: "EUR",
    status: "draft",
    stock: 999,
    category: "Template",
    sold: 0,
    rating: 0,
  },
];

// --- Campagne --------------------------------------------------------------

export const campaigns: Campaign[] = [
  {
    id: "cmp-1",
    name: "Lancio Primavera",
    channel: "meta",
    status: "active",
    budget: 1200,
    spent: 742,
    impressions: 184_000,
    clicks: 5_320,
    conversions: 214,
    currency: "EUR",
  },
  {
    id: "cmp-2",
    name: "Brand Awareness LinkedIn",
    channel: "linkedin",
    status: "paused",
    budget: 800,
    spent: 388,
    impressions: 62_400,
    clicks: 1_240,
    conversions: 46,
    currency: "EUR",
  },
  {
    id: "cmp-3",
    name: "Retargeting TikTok",
    channel: "tiktok",
    status: "completed",
    budget: 600,
    spent: 600,
    impressions: 240_000,
    clicks: 8_900,
    conversions: 302,
    currency: "EUR",
  },
];

// --- Notifiche -------------------------------------------------------------

export const notifications: Notification[] = [
  {
    id: "ntf-1",
    title: "Social Curator ha completato 3 task",
    description: "Contenuti pubblicati su Instagram e LinkedIn.",
    date: isoAgo(35),
    read: false,
    kind: "success",
  },
  {
    id: "ntf-2",
    title: "TikTok in attesa di autorizzazione",
    description: "Completa il collegamento per attivare l'agente.",
    date: isoAgo(180),
    read: false,
    kind: "warning",
  },
  {
    id: "ntf-3",
    title: "Ads Pilot ha riscontrato un errore",
    description: "Token scaduto su Meta Ads: riconnetti l'account.",
    date: isoAgo(320),
    read: false,
    kind: "error",
  },
  {
    id: "ntf-4",
    title: "Report settimanale disponibile",
    description: "Analytics Eye ha generato il report KPI.",
    date: isoAgoDays(2),
    read: true,
    kind: "info",
  },
];

// --- Utente ----------------------------------------------------------------

export const currentUser: User = {
  id: "user-1",
  name: "Mattia De Blasio",
  email: "mattia@aethersy.online",
  avatar: "/brand/logo-192.png",
  credits: 1250,
  plan: "pro",
};

// --- Contenuti Landing -----------------------------------------------------

export const landingContent: LandingContent = {
  platforms: ["instagram", "linkedin", "tiktok", "x", "facebook", "youtube"],
  features: [
    {
      id: "feat-1",
      title: "Agenti autonomi",
      description:
        "Robot AI che pianificano, creano e pubblicano mentre tu ti occupi del business.",
      icon: "Robot",
    },
    {
      id: "feat-2",
      title: "Multi-piattaforma",
      description:
        "Instagram, LinkedIn, TikTok, X, Facebook e YouTube da un'unica cabina di regia.",
      icon: "Share2",
    },
    {
      id: "feat-3",
      title: "Analytics unificati",
      description:
        "KPI, crescita follower e performance contenuti in una dashboard coerente.",
      icon: "BarChart3",
    },
    {
      id: "feat-4",
      title: "Automazioni rapide",
      description:
        "Trigger, scheduling e flussi operativi configurati in pochi clic.",
      icon: "Zap",
    },
    {
      id: "feat-5",
      title: "Presenza web integrata",
      description:
        "Sito, landing e catalogo prodotto allineati al tuo tono di voce.",
      icon: "Globe",
    },
    {
      id: "feat-6",
      title: "Sicurezza enterprise",
      description:
        "Accessi controllati, dati cifrati in transito e log di attivita' completi.",
      icon: "Shield",
    },
  ],
  steps: [
    {
      id: "step-1",
      title: "Connettiti",
      description: "Collega i tuoi account social in un minuto, senza codice.",
    },
    {
      id: "step-2",
      title: "Attiva Agenti",
      description: "Scegli gli agenti AI e assegna loro obiettivi e piattaforme.",
    },
    {
      id: "step-3",
      title: "Osserva Crescere",
      description: "Monitora risultati e lascia che gli agenti ottimizzino da soli.",
    },
  ],
  testimonials: [
    {
      id: "tst-1",
      name: "Giulia Ferri",
      role: "Founder",
      company: "Nord Retail",
      quote:
        "In tre mesi la nostra presenza social e' cresciuta del 40% senza assumere un social manager.",
      avatar: "/brand/logo-192.png",
    },
    {
      id: "tst-2",
      name: "Marco Bianchi",
      role: "Head of Marketing",
      company: "Sud Cultura",
      quote:
        "Gli agenti scrivono contenuti che sembrano nostri. Il risparmio di tempo e' enorme.",
      avatar: "/brand/logo-192.png",
    },
    {
      id: "tst-3",
      name: "Elena Rizzo",
      role: "Owner",
      company: "Studio Rizzo",
      quote:
        "Finalmente una dashboard unica per tutte le piattaforme. Consigliata a ogni agenzia.",
      avatar: "/brand/logo-192.png",
    },
  ],
  pricing: [
    {
      id: "starter",
      name: "Starter",
      monthlyPrice: 29,
      annualPrice: 290,
      description: "Per freelancer e piccole attivita'.",
      highlighted: false,
      features: [
        "1 workspace",
        "2 agenti AI",
        "3 piattaforme social",
        "500 crediti / mese",
        "Report mensile",
      ],
    },
    {
      id: "pro",
      name: "Pro",
      monthlyPrice: 79,
      annualPrice: 790,
      description: "Per agenzie e team in crescita.",
      highlighted: true,
      features: [
        "5 workspace",
        "10 agenti AI",
        "6 piattaforme social",
        "5.000 crediti / mese",
        "Analytics avanzati",
        "Outreach automatizzato",
      ],
    },
    {
      id: "enterprise",
      name: "Enterprise",
      monthlyPrice: 199,
      annualPrice: 1990,
      description: "Per organizzazioni strutturate.",
      highlighted: false,
      features: [
        "Workspace illimitati",
        "Agenti illimitati",
        "API e webhook dedicati",
        "Crediti personalizzati",
        "SLA e supporto prioritario",
        "SSO e audit log",
      ],
    },
  ],
};

/** Riepilogo piattaforme per la sezione "Integrazioni" della Landing. */
export const landingPlatformIds: PlatformId[] = landingContent.platforms;
