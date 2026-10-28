// =============================================================================
// API tipizzata (Stadio A).
//
// Oggi LEGGE dal mock layer con un piccolo delay, per simulare la latenza di
// rete e far lavorare correttamente React Query (loading/error states).
// La firma di ogni funzione e' quella finale: per passare ai backend reali basta
// sostituire il corpo con una `fetch` sull'endpoint indicato nel commento
// "Endpoint reale", senza toccare i componenti.
// =============================================================================

import {
  adCampaigns,
  adCreatives,
  adsSeries,
  adsSummary,
  agentActivitySeries,
  agentDetails,
  agentLogs,
  agents,
  analytics,
  apiKeys,
  campaigns,
  contactSubmissions,
  creditUsage,
  currentUser,
  dashboardStats,
  engagementByPlatform,
  faqItems,
  followerSeries,
  helpCategories,
  helpDocs,
  insights,
  invoices,
  landingContent,
  leads,
  notificationPreferences,
  notifications,
  outreachCampaigns,
  outreachSequences,
  outreachSummary,
  paymentMethods,
  platformNotificationPreferences,
  platforms,
  postDistribution,
  posts,
  products,
  scheduledPosts,
  seoReport,
  serviceStatuses,
  siteOverview,
  sitePages,
  socialSummary,
  statusUpdatedAt,
  tasks,
  userProfile,
  webhooks,
  workspaces,
} from "@/mocks";
import type {
  AdCampaign,
  AdCreative,
  AdsPoint,
  AdsSummary,
  Agent,
  AgentDetail,
  AgentInsight,
  AgentLog,
  AnalyticsPoint,
  ApiKey,
  Campaign,
  ContactSubmission,
  DashboardStat,
  FaqItem,
  HelpCategory,
  HelpDoc,
  Invoice,
  LandingContent,
  Lead,
  Notification,
  NotificationPreferences,
  OutreachCampaign,
  OutreachSequenceStep,
  OutreachSummary,
  PaymentMethod,
  Platform,
  PlatformAnalytics,
  PlatformId,
  PlatformNotificationPreference,
  Post,
  PostKind,
  Product,
  ScheduledPost,
  SeoReport,
  ServiceStatus,
  SiteOverview,
  SitePage,
  SocialSummary,
  Task,
  User,
  UserProfile,
  Webhook,
  Workspace,
} from "./types";

/** Latenza simulata del mock layer. */
const MOCK_DELAY_MS = 220;

function delay<T>(value: T, ms = MOCK_DELAY_MS): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

/** Copia difensiva: evita mutazioni accidentali dei dati mock condivisi. */
function clone<T>(value: T): T {
  return structuredClone(value);
}

export const api = {
  // --- Workspaces ---------------------------------------------------------

  /** Elenco workspace dell'utente. Endpoint reale: GET /api/workspaces */
  getWorkspaces(): Promise<Workspace[]> {
    return delay(clone(workspaces));
  },

  // --- Piattaforme --------------------------------------------------------

  /** Stato dei collegamenti social. Endpoint reale: GET /api/platforms */
  getPlatforms(): Promise<Platform[]> {
    return delay(clone(platforms));
  },

  /** Avvia il collegamento di una piattaforma. Endpoint reale: POST /api/platforms/:id/connect */
  connectPlatform(platformId: string): Promise<{ ok: true; platformId: string }> {
    return delay({ ok: true as const, platformId }, 400);
  },

  /** Rimuove il collegamento. Endpoint reale: DELETE /api/platforms/:id */
  disconnectPlatform(platformId: string): Promise<{ ok: true; platformId: string }> {
    return delay({ ok: true as const, platformId }, 400);
  },

  // --- Agenti -------------------------------------------------------------

  /** Agenti disponibili. Endpoint reale: GET /api/agents */
  getAgents(): Promise<Agent[]> {
    return delay(clone(agents));
  },

  /** Attiva un agente. Endpoint reale: POST /api/agents/:id/activate */
  activateAgent(agentId: string): Promise<{ ok: true; agentId: string }> {
    return delay({ ok: true as const, agentId }, 400);
  },

  /** Mette in pausa un agente. Endpoint reale: POST /api/agents/:id/pause */
  pauseAgent(agentId: string): Promise<{ ok: true; agentId: string }> {
    return delay({ ok: true as const, agentId }, 400);
  },

  // --- Task ---------------------------------------------------------------

  /** Task recenti / filtrati. Endpoint reale: GET /api/tasks?status= */
  getTasks(status?: string): Promise<Task[]> {
    const filtered = status ? tasks.filter((task) => task.status === status) : tasks;
    return delay(clone(filtered));
  },

  // --- Analytics ----------------------------------------------------------

  /** Statistiche sintetiche della dashboard. Endpoint reale: GET /api/stats/dashboard */
  getDashboardStats(): Promise<DashboardStat[]> {
    return delay(clone(dashboardStats));
  },

  /** Serie temporali per piattaforma. Endpoint reale: GET /api/analytics */
  getAnalytics(): Promise<PlatformAnalytics[]> {
    return delay(clone(analytics));
  },

  // --- Prodotti e campagne ------------------------------------------------

  /** Catalogo prodotti. Endpoint reale: GET /api/products */
  getProducts(): Promise<Product[]> {
    return delay(clone(products));
  },

  /** Campagne advertising. Endpoint reale: GET /api/campaigns */
  getCampaigns(): Promise<Campaign[]> {
    return delay(clone(campaigns));
  },

  // --- Landing e notifiche ------------------------------------------------

  /** Contenuti marketing della landing. Endpoint reale: GET /api/landing */
  getLandingContent(): Promise<LandingContent> {
    return delay(clone(landingContent));
  },

  /** Notifiche dell'utente. Endpoint reale: GET /api/notifications */
  getNotifications(): Promise<Notification[]> {
    return delay(clone(notifications));
  },

  // --- Utente -------------------------------------------------------------

  /** Profilo utente corrente. Endpoint reale: GET /api/me */
  getCurrentUser(): Promise<User> {
    return delay(clone(currentUser));
  },

  // =========================================================================
  // Stadio B
  // =========================================================================

  // --- Social Media -------------------------------------------------------

  /** Post recenti/programmati. Endpoint reale: GET /api/social/posts */
  getPosts(platform?: PlatformId): Promise<Post[]> {
    const filtered = platform ? posts.filter((post) => post.platform === platform) : posts;
    return delay(clone(filtered));
  },

  /** Riepilogo KPI social. Endpoint reale: GET /api/social/summary */
  getSocialSummary(): Promise<SocialSummary> {
    return delay(clone(socialSummary));
  },

  /** Prossime pubblicazioni programmate. Endpoint reale: GET /api/social/scheduled */
  getScheduledPosts(platform?: PlatformId): Promise<ScheduledPost[]> {
    const filtered = platform
      ? scheduledPosts.filter((post) => post.platform === platform)
      : scheduledPosts;
    return delay(clone(filtered));
  },

  /** Serie di crescita follower per piattaforma. Endpoint reale: GET /api/social/:id/followers */
  getFollowerSeries(platform: PlatformId): Promise<AnalyticsPoint[]> {
    return delay(clone(followerSeries[platform] ?? []));
  },

  /** Engagement percentuale per piattaforma. Endpoint reale: GET /api/analytics/engagement */
  getEngagementByPlatform(): Promise<{ platform: PlatformId; value: number }[]> {
    return delay(clone(engagementByPlatform));
  },

  /** Distribuzione post per tipo di contenuto. Endpoint reale: GET /api/analytics/post-distribution */
  getPostDistribution(): Promise<{ kind: PostKind; value: number }[]> {
    return delay(clone(postDistribution));
  },

  /** Pubblica (mock) un post. Endpoint reale: POST /api/social/posts */
  createPost(_input: { platform: PlatformId; text: string }): Promise<{ ok: true; id: string }> {
    return delay({ ok: true as const, id: `post-${Date.now()}` }, 500);
  },

  // --- Agenti (dettaglio e log) -------------------------------------------

  /** Dettaglio di un agente. Endpoint reale: GET /api/agents/:id */
  getAgentDetail(agentId: string): Promise<AgentDetail | null> {
    return delay(clone(agentDetails[agentId] ?? null));
  },

  /** Log di esecuzione di un agente. Endpoint reale: GET /api/agents/:id/logs */
  getAgentLogs(agentId: string): Promise<AgentLog[]> {
    return delay(clone(agentLogs.filter((log) => log.agentId === agentId)));
  },

  /** Crea (mock) un agente. Endpoint reale: POST /api/agents */
  createAgent(_input: { name: string; type: Agent["type"] }): Promise<{ ok: true; id: string }> {
    return delay({ ok: true as const, id: `agent-${Date.now()}` }, 600);
  },

  /** Aggiorna (mock) la configurazione di un agente. Endpoint reale: PATCH /api/agents/:id */
  updateAgent(agentId: string): Promise<{ ok: true; agentId: string }> {
    return delay({ ok: true as const, agentId }, 500);
  },

  // --- Outreach -----------------------------------------------------------

  /** KPI di outreach. Endpoint reale: GET /api/outreach/summary */
  getOutreachSummary(): Promise<OutreachSummary> {
    return delay(clone(outreachSummary));
  },

  /** Campagne di outreach. Endpoint reale: GET /api/outreach/campaigns */
  getOutreachCampaigns(): Promise<OutreachCampaign[]> {
    return delay(clone(outreachCampaigns));
  },

  /** Step di follow-up per campagna. Endpoint reale: GET /api/outreach/sequences */
  getOutreachSequences(campaignId?: string): Promise<OutreachSequenceStep[]> {
    const filtered = campaignId
      ? outreachSequences.filter((step) => step.campaignId === campaignId)
      : outreachSequences;
    return delay(clone(filtered));
  },

  /** Lead/prospect. Endpoint reale: GET /api/outreach/leads */
  getLeads(): Promise<Lead[]> {
    return delay(clone(leads));
  },

  /** Crea (mock) una campagna di outreach. Endpoint reale: POST /api/outreach/campaigns */
  createOutreachCampaign(_input: { name: string }): Promise<{ ok: true; id: string }> {
    return delay({ ok: true as const, id: `oc-${Date.now()}` }, 600);
  },

  // --- Sito Web -----------------------------------------------------------

  /** Stato del sito. Endpoint reale: GET /api/website/overview */
  getSiteOverview(): Promise<SiteOverview> {
    return delay(clone(siteOverview));
  },

  /** Pagine del sito. Endpoint reale: GET /api/website/pages */
  getSitePages(): Promise<SitePage[]> {
    return delay(clone(sitePages));
  },

  /** Report SEO. Endpoint reale: GET /api/website/seo */
  getSeoReport(): Promise<SeoReport> {
    return delay(clone(seoReport));
  },

  /** Messaggi dal form contatti. Endpoint reale: GET /api/website/submissions */
  getContactSubmissions(): Promise<ContactSubmission[]> {
    return delay(clone(contactSubmissions));
  },

  /** Pubblica (mock) una pagina. Endpoint reale: POST /api/website/pages/:id/publish */
  publishSitePage(pageId: string): Promise<{ ok: true; pageId: string }> {
    return delay({ ok: true as const, pageId }, 500);
  },

  // --- Annunci ------------------------------------------------------------

  /** KPI advertising. Endpoint reale: GET /api/ads/summary */
  getAdsSummary(): Promise<AdsSummary> {
    return delay(clone(adsSummary));
  },

  /** Campagne advertising con piattaforma/obiettivo. Endpoint reale: GET /api/ads/campaigns */
  getAdCampaigns(): Promise<AdCampaign[]> {
    return delay(clone(adCampaigns));
  },

  /** Creativita'/annunci. Endpoint reale: GET /api/ads/creatives */
  getAdCreatives(): Promise<AdCreative[]> {
    return delay(clone(adCreatives));
  },

  /** Serie spesa vs conversioni. Endpoint reale: GET /api/ads/series */
  getAdsSeries(): Promise<AdsPoint[]> {
    return delay(clone(adsSeries));
  },

  /** Crea (mock) una campagna ads. Endpoint reale: POST /api/ads/campaigns */
  createAdCampaign(_input: { name: string }): Promise<{ ok: true; id: string }> {
    return delay({ ok: true as const, id: `cmp-${Date.now()}` }, 600);
  },

  // --- Prodotti -----------------------------------------------------------

  /** Crea (mock) un prodotto. Endpoint reale: POST /api/products */
  createProduct(_input: { name: string }): Promise<{ ok: true; id: string }> {
    return delay({ ok: true as const, id: `prod-${Date.now()}` }, 600);
  },

  // --- Analisi ------------------------------------------------------------

  /** Insight generati dagli agenti. Endpoint reale: GET /api/analytics/insights */
  getInsights(): Promise<AgentInsight[]> {
    return delay(clone(insights));
  },

  /** Serie attivita' agenti nel tempo. Endpoint reale: GET /api/analytics/agent-activity */
  getAgentActivitySeries(): Promise<AnalyticsPoint[]> {
    return delay(clone(agentActivitySeries));
  },

  // =========================================================================
  // Stadio C — Impostazioni e Aiuto
  // =========================================================================

  // --- Profilo ------------------------------------------------------------

  /** Profilo utente completo. Endpoint reale: GET /api/settings/profile */
  getUserProfile(): Promise<UserProfile> {
    return delay(clone(userProfile));
  },

  /** Aggiorna (mock) il profilo. Endpoint reale: PATCH /api/settings/profile */
  updateUserProfile(_input: Partial<UserProfile>): Promise<{ ok: true }> {
    return delay({ ok: true as const }, 500);
  },

  // --- Fatturazione -------------------------------------------------------

  /** Storico fatture. Endpoint reale: GET /api/settings/invoices */
  getInvoices(): Promise<Invoice[]> {
    return delay(clone(invoices));
  },

  /** Metodi di pagamento salvati. Endpoint reale: GET /api/settings/payment-methods */
  getPaymentMethods(): Promise<PaymentMethod[]> {
    return delay(clone(paymentMethods));
  },

  /** Aggiunge (mock) un metodo di pagamento. Endpoint reale: POST /api/settings/payment-methods */
  addPaymentMethod(_input: { brand: string; last4: string }): Promise<{ ok: true; id: string }> {
    return delay({ ok: true as const, id: `pm-${Date.now()}` }, 500);
  },

  /** Rimuove (mock) un metodo di pagamento. Endpoint reale: DELETE /api/settings/payment-methods/:id */
  removePaymentMethod(paymentMethodId: string): Promise<{ ok: true; id: string }> {
    return delay({ ok: true as const, id: paymentMethodId }, 400);
  },

  /** Consumo crediti del periodo. Endpoint reale: GET /api/settings/credits */
  getCreditUsage(): Promise<{ used: number; total: number }> {
    return delay({ used: creditUsage.used, total: creditUsage.total });
  },

  // --- Integrazioni -------------------------------------------------------

  /** Chiavi API (solo prefisso, mai la chiave completa). Endpoint reale: GET /api/settings/api-keys */
  getApiKeys(): Promise<ApiKey[]> {
    return delay(clone(apiKeys));
  },

  /** Crea (mock) una chiave API. Endpoint reale: POST /api/settings/api-keys */
  createApiKey(_input: { name: string; environment: ApiKey["environment"] }): Promise<{
    ok: true;
    id: string;
    prefix: string;
  }> {
    return delay({ ok: true as const, id: `key-${Date.now()}`, prefix: "ak_live_" }, 600);
  },

  /** Revoca (mock) una chiave API. Endpoint reale: DELETE /api/settings/api-keys/:id */
  revokeApiKey(apiKeyId: string): Promise<{ ok: true; id: string }> {
    return delay({ ok: true as const, id: apiKeyId }, 400);
  },

  /** Webhook configurati. Endpoint reale: GET /api/settings/webhooks */
  getWebhooks(): Promise<Webhook[]> {
    return delay(clone(webhooks));
  },

  /** Crea (mock) un webhook. Endpoint reale: POST /api/settings/webhooks */
  createWebhook(_input: { url: string; events: string[] }): Promise<{ ok: true; id: string }> {
    return delay({ ok: true as const, id: `wh-${Date.now()}` }, 600);
  },

  /** Rimuove (mock) un webhook. Endpoint reale: DELETE /api/settings/webhooks/:id */
  removeWebhook(webhookId: string): Promise<{ ok: true; id: string }> {
    return delay({ ok: true as const, id: webhookId }, 400);
  },

  // --- Notifiche ----------------------------------------------------------

  /** Preferenze notifiche generali. Endpoint reale: GET /api/settings/notifications */
  getNotificationPreferences(): Promise<NotificationPreferences> {
    return delay(clone(notificationPreferences));
  },

  /** Preferenze notifiche per piattaforma. Endpoint reale: GET /api/settings/notifications/platforms */
  getPlatformNotificationPreferences(): Promise<PlatformNotificationPreference[]> {
    return delay(clone(platformNotificationPreferences));
  },

  /** Aggiorna (mock) le preferenze notifiche. Endpoint reale: PATCH /api/settings/notifications */
  updateNotificationPreferences(
    _input: Partial<NotificationPreferences>,
  ): Promise<{ ok: true }> {
    return delay({ ok: true as const }, 500);
  },

  // --- Aiuto --------------------------------------------------------------

  /** Categorie della knowledge base. Endpoint reale: GET /api/help/categories */
  getHelpCategories(): Promise<HelpCategory[]> {
    return delay(clone(helpCategories));
  },

  /** Domande frequenti. Endpoint reale: GET /api/help/faq */
  getFaqItems(): Promise<FaqItem[]> {
    return delay(clone(faqItems));
  },

  /** Documentazione collegata. Endpoint reale: GET /api/help/docs */
  getHelpDocs(): Promise<HelpDoc[]> {
    return delay(clone(helpDocs));
  },

  /** Stato dei servizi. Endpoint reale: GET /api/status */
  getServiceStatuses(): Promise<ServiceStatus[]> {
    return delay(clone(serviceStatuses));
  },

  /** Ultimo aggiornamento dello stato. Endpoint reale: GET /api/status */
  getStatusUpdatedAt(): Promise<string> {
    return delay(statusUpdatedAt);
  },
};
