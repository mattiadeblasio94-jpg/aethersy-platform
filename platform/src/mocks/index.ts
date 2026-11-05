// Punto di ingresso del mock layer. Raggruppa i dati in un unico namespace
// tipizzato, cosi' il passaggio ai backend reali tocca solo src/lib/api.ts.
export {
  agents,
  analytics,
  campaigns,
  currentUser,
  dashboardStats,
  landingContent,
  landingPlatformIds,
  notifications,
  platforms,
  products,
  tasks,
  workspaces,
} from "./data";

// Dati dello Stadio B (Social Media, Agenti, Outreach, Sito, Annunci, Analisi).
export {
  adCampaigns,
  adCreatives,
  adsSeries,
  adsSummary,
  agentActivitySeries,
  agentDetails,
  agentLogs,
  contactSubmissions,
  engagementByPlatform,
  followerSeries,
  insights,
  leads,
  outreachCampaigns,
  outreachSequences,
  outreachSummary,
  postDistribution,
  posts,
  scheduledPosts,
  seoReport,
  siteOverview,
  sitePages,
  socialSummary,
} from "./stageB";

// Dati dello Stadio C (Impostazioni e Aiuto).
export {
  apiKeys,
  aiProviders,
  creditUsage,
  faqItems,
  helpCategories,
  helpDocs,
  invoices,
  languageOptions,
  notificationCadenceOptions,
  notificationPreferences,
  paymentMethods,
  platformNotificationPreferences,
  serviceStatuses,
  statusUpdatedAt,
  timezoneOptions,
  userProfile,
  webhookEventOptions,
  webhooks,
} from "./stageC";
