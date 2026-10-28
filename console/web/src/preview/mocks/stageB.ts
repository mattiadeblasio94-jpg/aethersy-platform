// =============================================================================
// Mock layer (Stadio B). Estende src/mocks/data.ts con i dati delle pagine
// Social Media, Agenti (dettaglio/log), Outreach, Sito Web, Annunci, Prodotti
// e Analisi. Stesso principio dello Stadio A: dati realistici, tipizzati,
// deterministici e senza alcun dato sensibile (zero segreti).
// =============================================================================

import { agents, platforms } from "./data";
import type {
  AdCampaign,
  AdCreative,
  AdsPoint,
  AdsSummary,
  AgentDetail,
  AgentInsight,
  AgentLog,
  AnalyticsPoint,
  ContactSubmission,
  Lead,
  OutreachCampaign,
  OutreachSequenceStep,
  OutreachSummary,
  PlatformId,
  Post,
  PostKind,
  ScheduledPost,
  SeoReport,
  SiteOverview,
  SitePage,
  SocialSummary,
} from "@pv/lib/types";

// --- Helper deterministici -------------------------------------------------

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

function isoHoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 3_600_000).toISOString();
}

function isoDaysAhead(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

/** Serie deterministica e regolare (nessun Math.random: output stabile). */
function buildSeries(
  length: number,
  base: number,
  growthPerStep: number,
  amplitude: number,
  phase = 0,
): number[] {
  return Array.from({ length }, (_, index) =>
    Math.max(
      0,
      Math.round(
        base + growthPerStep * index + amplitude * Math.sin((index + phase) / 2.4),
      ),
    ),
  );
}

const DAY_MS = 86_400_000;

/** Genera una serie temporale di N giorni che termina oggi. */
function seriesForPlatform(platform: PlatformId, days: number): AnalyticsPoint[] {
  const config: Record<PlatformId, { base: number; growth: number; amplitude: number }> = {
    instagram: { base: 16_500, growth: 12, amplitude: 260 },
    linkedin: { base: 8_400, growth: 7, amplitude: 140 },
    youtube: { base: 6_100, growth: -3, amplitude: 90 },
    tiktok: { base: 3_900, growth: 22, amplitude: 180 },
    x: { base: 2_100, growth: 4, amplitude: 70 },
    facebook: { base: 4_800, growth: 2, amplitude: 110 },
  };
  const { base, growth, amplitude } = config[platform];
  const values = buildSeries(days, base, growth, amplitude, platform.length);
  return values.map((value, index) => {
    const date = new Date(Date.now() - (days - 1 - index) * DAY_MS);
    return {
      label: `${date.getDate()}/${date.getMonth() + 1}`,
      date: date.toISOString(),
      value,
    };
  });
}

// --- Social Media ----------------------------------------------------------

export const socialSummary: SocialSummary = {
  totalFollowers: platforms.reduce((sum, platform) => sum + platform.stats.followers, 0),
  engagementRate: 4.8,
  postsThisWeek: 14,
  reach: 128_400,
};

const postTexts: { platform: PlatformId; text: string; kind: PostKind }[] = [
  {
    platform: "instagram",
    text: "Nuovo carosello: 5 errori da evitare nel social media marketing.",
    kind: "carousel",
  },
  {
    platform: "linkedin",
    text: "Come abbiamo ridotto il tempo di risposta ai lead del 40% con gli agenti AI.",
    kind: "article",
  },
  {
    platform: "youtube",
    text: "Tutorial: dashboard unificata in 10 minuti (video completo).",
    kind: "video",
  },
  {
    platform: "instagram",
    text: "Behind the scenes del nostro studio: la giornata di un social manager.",
    kind: "reel",
  },
  {
    platform: "tiktok",
    text: "3 hook che fermano lo scroll nei primi 2 secondi.",
    kind: "reel",
  },
  {
    platform: "linkedin",
    text: "Case study: +32% di follower organici in 90 giorni.",
    kind: "post",
  },
  {
    platform: "instagram",
    text: "Storia: sondaggio sui contenuti che vuoi vedere di piu'.",
    kind: "story",
  },
  {
    platform: "youtube",
    text: "Short: automazione outreach con un solo comando.",
    kind: "video",
  },
  {
    platform: "x",
    text: "Thread: 7 metriche che contano davvero nel 2026.",
    kind: "post",
  },
  {
    platform: "instagram",
    text: "Bozza: guida completa al calendario editoriale.",
    kind: "carousel",
  },
];

const postStatuses: Post["status"][] = [
  "published",
  "published",
  "published",
  "published",
  "published",
  "published",
  "published",
  "scheduled",
  "scheduled",
  "draft",
];

export const posts: Post[] = postTexts.map((entry, index) => {
  const published = index < 7;
  return {
    id: `post-${index + 1}`,
    platform: entry.platform,
    text: entry.text,
    kind: entry.kind,
    status: postStatuses[index],
    date: published ? isoHoursAgo(8 + index * 19) : isoDaysAhead(index - 6),
    engagement: published
      ? {
          likes: [1_240, 486, 318, 902, 1_560, 274, 133][index] ?? 120,
          comments: [86, 42, 29, 64, 112, 21, 15][index] ?? 10,
          shares: [214, 58, 41, 96, 240, 33, 12][index] ?? 8,
        }
      : { likes: 0, comments: 0, shares: 0 },
  };
});

export const scheduledPosts: ScheduledPost[] = [
  {
    id: "sched-1",
    platform: "instagram",
    title: "Reel: 3 strumenti AI per creator",
    date: isoDaysAhead(1),
  },
  {
    id: "sched-2",
    platform: "linkedin",
    title: "Post: lezione dal nostro ultimo lancio",
    date: isoDaysAhead(2),
  },
  {
    id: "sched-3",
    platform: "youtube",
    title: "Video: setup completo dell'agenzia",
    date: isoDaysAhead(4),
  },
  {
    id: "sched-4",
    platform: "tiktok",
    title: "Reel: errori nel brief creativo",
    date: isoDaysAhead(6),
  },
];

/** Serie di crescita follower per il grafico del dettaglio piattaforma. */
export const followerSeries: Record<PlatformId, AnalyticsPoint[]> = {
  instagram: seriesForPlatform("instagram", 30),
  linkedin: seriesForPlatform("linkedin", 30),
  youtube: seriesForPlatform("youtube", 30),
  tiktok: seriesForPlatform("tiktok", 30),
  x: seriesForPlatform("x", 30),
  facebook: seriesForPlatform("facebook", 30),
};

export const engagementByPlatform = [
  { platform: "instagram" as PlatformId, value: 5.6 },
  { platform: "linkedin" as PlatformId, value: 4.2 },
  { platform: "tiktok" as PlatformId, value: 7.1 },
  { platform: "youtube" as PlatformId, value: 3.4 },
  { platform: "x" as PlatformId, value: 2.8 },
  { platform: "facebook" as PlatformId, value: 2.1 },
];

export const postDistribution: { kind: PostKind; value: number }[] = [
  { kind: "carousel", value: 28 },
  { kind: "reel", value: 34 },
  { kind: "post", value: 22 },
  { kind: "video", value: 12 },
  { kind: "story", value: 18 },
  { kind: "article", value: 9 },
];

// --- Agenti: dettaglio, log, attivita' -------------------------------------

const agentModels: Record<string, string> = {
  "agent-social-curator": "OpenRouter · gpt-4o-mini",
  "agent-content-writer": "OpenRouter · claude-3-haiku",
  "agent-outreach-pro": "OpenRouter · gpt-4o-mini",
  "agent-analytics-eye": "OpenRouter · llama-3.1-70b",
  "agent-ads-pilot": "OpenRouter · gpt-4o",
};

const agentMetrics: Record<string, { successRate: number; avgDurationMs: number }> = {
  "agent-social-curator": { successRate: 96, avgDurationMs: 4_200 },
  "agent-content-writer": { successRate: 91, avgDurationMs: 6_800 },
  "agent-outreach-pro": { successRate: 88, avgDurationMs: 9_400 },
  "agent-analytics-eye": { successRate: 99, avgDurationMs: 2_600 },
  "agent-ads-pilot": { successRate: 72, avgDurationMs: 11_200 },
};

function activityFor(agentId: string): AgentDetail["activity"] {
  return [
    { id: `${agentId}-a1`, agentId, label: "Task completato con successo", date: isoHoursAgo(2), kind: "success" as const },
    { id: `${agentId}-a2`, agentId, label: "Nuova pianificazione generata", date: isoHoursAgo(7), kind: "info" as const },
    { id: `${agentId}-a3`, agentId, label: "Rate limit raggiunto sul provider", date: isoHoursAgo(19), kind: "warning" as const },
    { id: `${agentId}-a4`, agentId, label: "Task completato con successo", date: isoDaysAgo(1), kind: "success" as const },
    { id: `${agentId}-a5`, agentId, label: "Configurazione aggiornata", date: isoDaysAgo(2), kind: "info" as const },
  ];
}

export const agentDetails: Record<string, AgentDetail> = Object.fromEntries(
  agents.map((agent) => [
    agent.id,
    {
      agent,
      tasksCompleted: agent.tasksCompleted,
      successRate: agentMetrics[agent.id]?.successRate ?? 90,
      avgDurationMs: agentMetrics[agent.id]?.avgDurationMs ?? 5_000,
      model: agentModels[agent.id] ?? "OpenRouter · gpt-4o-mini",
      config: [
        { label: "Frequenza", value: agent.status === "active" ? "Ogni 6 ore" : "Manuale" },
        { label: "Modello AI", value: agentModels[agent.id] ?? "OpenRouter · gpt-4o-mini" },
        {
          label: "Piattaforme target",
          value: agent.targetPlatforms.join(", ") || "—",
        },
        { label: "Limite giornaliero", value: "50 operazioni" },
        { label: "Ripetizioni in caso di errore", value: "2" },
      ],
      activity: activityFor(agent.id),
    } satisfies AgentDetail,
  ]),
);

const logMessages: { level: AgentLog["level"]; message: string }[] = [
  { level: "info", message: "Avvio ciclo di esecuzione pianificato" },
  { level: "info", message: "Recupero coda task dal workspace attivo" },
  { level: "info", message: "Generazione contenuto tramite provider AI" },
  { level: "warn", message: "Latenza del provider sopra la soglia (2.4s)" },
  { level: "error", message: "Pubblicazione fallita: token account scaduto" },
  { level: "info", message: "Contenuto pubblicato correttamente" },
  { level: "warn", message: "Quota API al 85% del limite orario" },
  { level: "error", message: "Timeout durante la chiamata all'endpoint social" },
  { level: "info", message: "Report KPI generato e salvato" },
  { level: "info", message: "Sincronizzazione metriche completata" },
];

export const agentLogs: AgentLog[] = Array.from({ length: 48 }, (_, index) => {
  const template = logMessages[index % logMessages.length];
  const agentId = agents[index % agents.length].id;
  return {
    id: `log-${index + 1}`,
    agentId,
    timestamp: isoHoursAgo(index * 1.5 + 1),
    level: template.level,
    message: template.message,
    durationMs: 320 + ((index * 137) % 4_800),
  };
});

// --- Outreach --------------------------------------------------------------

export const outreachSummary: OutreachSummary = {
  messagesSent: 1_284,
  responseRate: 22.4,
  meetings: 38,
  conversionRate: 9.6,
};

export const outreachCampaigns: OutreachCampaign[] = [
  {
    id: "oc-1",
    name: "Agenzie digitali — Nord Italia",
    channel: "linkedin",
    status: "active",
    sent: 420,
    replies: 96,
    conversionRate: 14.2,
    startedAt: isoDaysAgo(21),
  },
  {
    id: "oc-2",
    name: "E-commerce in crescita",
    channel: "email",
    status: "active",
    sent: 380,
    replies: 62,
    conversionRate: 8.4,
    startedAt: isoDaysAgo(14),
  },
  {
    id: "oc-3",
    name: "Freelance marketing",
    channel: "linkedin",
    status: "paused",
    sent: 268,
    replies: 41,
    conversionRate: 5.1,
    startedAt: isoDaysAgo(35),
  },
  {
    id: "oc-4",
    name: "Ristorazione locale",
    channel: "email",
    status: "completed",
    sent: 216,
    replies: 28,
    conversionRate: 3.8,
    startedAt: isoDaysAgo(52),
  },
];

export const outreachSequences: OutreachSequenceStep[] = [
  { id: "seq-1", campaignId: "oc-1", order: 1, channel: "linkedin", dayOffset: 0, subject: "Connessione + presentazione", openRate: 68 },
  { id: "seq-2", campaignId: "oc-1", order: 2, channel: "linkedin", dayOffset: 3, subject: "Follow-up con caso studio", openRate: 44 },
  { id: "seq-3", campaignId: "oc-1", order: 3, channel: "email", dayOffset: 7, subject: "Proposta di call introduttiva", openRate: 31 },
  { id: "seq-4", campaignId: "oc-2", order: 1, channel: "email", dayOffset: 0, subject: "Idea per aumentare il ROI", openRate: 52 },
  { id: "seq-5", campaignId: "oc-2", order: 2, channel: "email", dayOffset: 4, subject: "Promemoria con risultati", openRate: 27 },
  { id: "seq-6", campaignId: "oc-3", order: 1, channel: "linkedin", dayOffset: 0, subject: "Collaborazione per freelance", openRate: 39 },
];

export const leads: Lead[] = [
  { id: "lead-1", name: "Giulia Ferri", company: "Nord Retail", channel: "linkedin", status: "interested", lastContact: isoHoursAgo(6), email: "giulia@nordretail.example" },
  { id: "lead-2", name: "Marco Bianchi", company: "Sud Cultura", channel: "email", status: "meeting", lastContact: isoHoursAgo(28), email: "marco@sudcultura.example" },
  { id: "lead-3", name: "Elena Rizzo", company: "Studio Rizzo", channel: "linkedin", status: "replied", lastContact: isoDaysAgo(2), email: "elena@studiorizzo.example" },
  { id: "lead-4", name: "Paolo Greco", company: "Verde Spa", channel: "email", status: "contacted", lastContact: isoDaysAgo(3), email: "paolo@verdespa.example" },
  { id: "lead-5", name: "Sara Conti", company: "Casa Bella", channel: "twitter", status: "new", lastContact: null, email: "sara@casabella.example" },
  { id: "lead-6", name: "Davide Fontana", company: "Tech Liguria", channel: "linkedin", status: "won", lastContact: isoDaysAgo(5), email: "davide@techliguria.example" },
  { id: "lead-7", name: "Anna Marchetti", company: "Alba Studio", channel: "email", status: "lost", lastContact: isoDaysAgo(9), email: "anna@albastudio.example" },
  { id: "lead-8", name: "Luca Serra", company: "Riviera Tour", channel: "linkedin", status: "contacted", lastContact: isoDaysAgo(1), email: "luca@rivieratour.example" },
];

// --- Sito Web --------------------------------------------------------------

export const siteOverview: SiteOverview = {
  status: "published",
  lastDeploy: isoHoursAgo(9),
  domain: "www.aethersy.example",
  visitors: 8_420,
  pageViews: 21_760,
  bounceRate: 38.5,
};

export const sitePages: SitePage[] = [
  { id: "sp-1", path: "/", title: "Home", status: "published", updatedAt: isoDaysAgo(2), views: 6_120 },
  { id: "sp-2", path: "/chi-siamo", title: "Chi siamo", status: "published", updatedAt: isoDaysAgo(8), views: 1_840 },
  { id: "sp-3", path: "/servizi", title: "Servizi", status: "published", updatedAt: isoDaysAgo(5), views: 3_260 },
  { id: "sp-4", path: "/prodotti", title: "Prodotti", status: "review", updatedAt: isoHoursAgo(20), views: 2_140 },
  { id: "sp-5", path: "/contatti", title: "Contatti", status: "published", updatedAt: isoDaysAgo(16), views: 980 },
  { id: "sp-6", path: "/blog", title: "Blog", status: "draft", updatedAt: isoHoursAgo(4), views: 0 },
];

export const seoReport: SeoReport = {
  score: 78,
  checks: [
    { id: "seo-title", label: "Title tag", description: "Tutte le pagine hanno un title univoco sotto 60 caratteri.", status: "ok" },
    { id: "seo-meta", label: "Meta description", description: "2 pagine senza meta description.", status: "warning" },
    { id: "seo-heading", label: "Gerarchia heading", description: "Un H1 per pagina rispettato.", status: "ok" },
    { id: "seo-alt", label: "Testo alternativo immagini", description: "12 immagini senza attributo alt.", status: "error" },
    { id: "seo-sitemap", label: "Sitemap XML", description: "Sitemap generata e raggiungibile.", status: "ok" },
    { id: "seo-robots", label: "robots.txt", description: "robots.txt presente ma blocca /blog per errore.", status: "warning" },
  ],
};

export const contactSubmissions: ContactSubmission[] = [
  { id: "cs-1", name: "Chiara Esposito", email: "chiara@example.com", subject: "Preventivo sito web", message: "Vorrei un preventivo per un nuovo sito.", date: isoHoursAgo(3), read: false },
  { id: "cs-2", name: "Andrea Moretti", email: "andrea@example.com", subject: "Collaborazione", message: "Siamo interessati a una partnership.", date: isoHoursAgo(26), read: false },
  { id: "cs-3", name: "Francesca Gallo", email: "francesca@example.com", subject: "Supporto", message: "Non riesco ad accedere al pannello.", date: isoDaysAgo(2), read: true },
  { id: "cs-4", name: "Roberto Villa", email: "roberto@example.com", subject: "Informazioni prezzi", message: "Qual e' il costo del piano Pro?", date: isoDaysAgo(4), read: true },
];

// --- Annunci ---------------------------------------------------------------

export const adsSummary: AdsSummary = {
  spend: 3_640,
  impressions: 986_400,
  clicks: 24_180,
  ctr: 2.45,
  cpc: 0.15,
  conversions: 1_042,
  roas: 4.3,
};

export const adCampaigns: AdCampaign[] = [
  { id: "cmp-1", name: "Lancio Primavera", channel: "meta", platform: "instagram", objective: "conversions", status: "active", budget: 1200, spent: 742, impressions: 184_000, clicks: 5_320, conversions: 214, currency: "EUR" },
  { id: "cmp-2", name: "Brand Awareness LinkedIn", channel: "linkedin", platform: "linkedin", objective: "awareness", status: "paused", budget: 800, spent: 388, impressions: 62_400, clicks: 1_240, conversions: 46, currency: "EUR" },
  { id: "cmp-3", name: "Retargeting TikTok", channel: "tiktok", platform: "tiktok", objective: "conversions", status: "completed", budget: 600, spent: 600, impressions: 240_000, clicks: 8_900, conversions: 302, currency: "EUR" },
  { id: "cmp-4", name: "Lead Gen Google", channel: "google", platform: "youtube", objective: "leads", status: "active", budget: 1_500, spent: 1_120, impressions: 420_000, clicks: 7_400, conversions: 388, currency: "EUR" },
  { id: "cmp-5", name: "Video Views YouTube", channel: "google", platform: "youtube", objective: "engagement", status: "draft", budget: 500, spent: 0, impressions: 0, clicks: 0, conversions: 0, currency: "EUR" },
];

export const adCreatives: AdCreative[] = [
  { id: "cr-1", campaignId: "cmp-1", name: "Carosello prodotto A", platform: "instagram", status: "active", impressions: 92_000, clicks: 2_760, cpm: 8.4, conversions: 118 },
  { id: "cr-2", campaignId: "cmp-1", name: "Video 15s dinamico", platform: "instagram", status: "active", impressions: 92_000, clicks: 2_560, cpm: 7.9, conversions: 96 },
  { id: "cr-3", campaignId: "cmp-2", name: "Banner leadership", platform: "linkedin", status: "paused", impressions: 62_400, clicks: 1_240, cpm: 11.2, conversions: 46 },
  { id: "cr-4", campaignId: "cmp-3", name: "Story retargeting", platform: "tiktok", status: "completed", impressions: 240_000, clicks: 8_900, cpm: 3.1, conversions: 302 },
  { id: "cr-5", campaignId: "cmp-4", name: "Lead form video", platform: "youtube", status: "active", impressions: 420_000, clicks: 7_400, cpm: 5.6, conversions: 388 },
  { id: "cr-6", campaignId: "cmp-4", name: "Discovery statico", platform: "youtube", status: "active", impressions: 0, clicks: 0, cpm: 0, conversions: 0 },
];

export const adsSeries: AdsPoint[] = buildSeries(14, 180, 12, 60, 2).map((spend, index) => ({
  label: `S${index + 1}`,
  date: isoDaysAgo(13 - index),
  spend,
  conversions: Math.round(spend / 4.3),
}));

// --- Insight ---------------------------------------------------------------

export const insights: AgentInsight[] = [
  {
    id: "ins-1",
    agentId: "agent-analytics-eye",
    agentName: "Analytics Eye",
    title: "TikTok cresce 3x piu' veloce degli altri canali",
    body: "Negli ultimi 30 giorni TikTok ha registrato la crescita follower piu' rapida. Valuta di spostare 20% del budget contenuti su questo canale.",
    date: isoHoursAgo(4),
    kind: "opportunity",
  },
  {
    id: "ins-2",
    agentId: "agent-ads-pilot",
    agentName: "Ads Pilot",
    title: "ROAS campagna Google sopra la media",
    body: "La campagna Lead Gen Google ha un ROAS di 5.2, superiore del 21% alla media dell'account. Suggerito aumento del budget del 15%.",
    date: isoHoursAgo(11),
    kind: "trend",
  },
  {
    id: "ins-3",
    agentId: "agent-social-curator",
    agentName: "Social Curator",
    title: "Calo di reach su YouTube",
    body: "La reach YouTube e' diminuita del 2.3%. I contenuti brevi performano meglio: convertire 2 video lunghi in short.",
    date: isoHoursAgo(30),
    kind: "warning",
  },
  {
    id: "ins-4",
    agentId: "agent-outreach-pro",
    agentName: "Outreach Pro",
    title: "Miglior orario di invio: martedi' 10:00",
    body: "Le sequenze inviate martedi' mattina ottengono un tasso di risposta del 31%, il piu' alto della settimana.",
    date: isoDaysAgo(2),
    kind: "opportunity",
  },
];

// --- Serie analisi (attivita' agenti) --------------------------------------

export const agentActivitySeries: AnalyticsPoint[] = buildSeries(30, 22, 1.2, 9, 5).map(
  (value, index) => ({
    label: `${index + 1}`,
    date: isoDaysAgo(29 - index),
    value,
  }),
);
