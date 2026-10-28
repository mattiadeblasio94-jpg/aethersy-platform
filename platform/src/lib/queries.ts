// =============================================================================
// React Query hooks. Incapsulano src/lib/api.ts e centralizzano le query key,
// cosi' l'invalidazione della cache resta coerente in tutta l'app.
// =============================================================================

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
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

export const queryKeys = {
  workspaces: ["workspaces"] as const,
  platforms: ["platforms"] as const,
  agents: ["agents"] as const,
  tasks: (status?: string) => ["tasks", status ?? "all"] as const,
  dashboardStats: ["dashboard-stats"] as const,
  analytics: ["analytics"] as const,
  products: ["products"] as const,
  campaigns: ["campaigns"] as const,
  landing: ["landing"] as const,
  notifications: ["notifications"] as const,
  currentUser: ["current-user"] as const,
  // Stadio B
  posts: (platform?: PlatformId) => ["posts", platform ?? "all"] as const,
  socialSummary: ["social-summary"] as const,
  scheduledPosts: (platform?: PlatformId) => ["scheduled-posts", platform ?? "all"] as const,
  followerSeries: (platform: PlatformId) => ["follower-series", platform] as const,
  engagementByPlatform: ["engagement-by-platform"] as const,
  postDistribution: ["post-distribution"] as const,
  agentDetail: (agentId: string) => ["agent-detail", agentId] as const,
  agentLogs: (agentId: string) => ["agent-logs", agentId] as const,
  outreachSummary: ["outreach-summary"] as const,
  outreachCampaigns: ["outreach-campaigns"] as const,
  outreachSequences: (campaignId?: string) =>
    ["outreach-sequences", campaignId ?? "all"] as const,
  leads: ["leads"] as const,
  siteOverview: ["site-overview"] as const,
  sitePages: ["site-pages"] as const,
  seoReport: ["seo-report"] as const,
  contactSubmissions: ["contact-submissions"] as const,
  adsSummary: ["ads-summary"] as const,
  adCampaigns: ["ad-campaigns"] as const,
  adCreatives: ["ad-creatives"] as const,
  adsSeries: ["ads-series"] as const,
  insights: ["insights"] as const,
  agentActivitySeries: ["agent-activity-series"] as const,
  // Stadio C
  userProfile: ["user-profile"] as const,
  invoices: ["invoices"] as const,
  paymentMethods: ["payment-methods"] as const,
  creditUsage: ["credit-usage"] as const,
  apiKeys: ["api-keys"] as const,
  webhooks: ["webhooks"] as const,
  notificationPreferences: ["notification-preferences"] as const,
  platformNotificationPreferences: ["platform-notification-preferences"] as const,
  helpCategories: ["help-categories"] as const,
  faqItems: ["faq-items"] as const,
  helpDocs: ["help-docs"] as const,
  serviceStatuses: ["service-statuses"] as const,
  statusUpdatedAt: ["status-updated-at"] as const,
};

export function useWorkspaces() {
  return useQuery<Workspace[]>({
    queryKey: queryKeys.workspaces,
    queryFn: () => api.getWorkspaces(),
  });
}

export function usePlatforms() {
  return useQuery<Platform[]>({
    queryKey: queryKeys.platforms,
    queryFn: () => api.getPlatforms(),
  });
}

export function useAgents() {
  return useQuery<Agent[]>({
    queryKey: queryKeys.agents,
    queryFn: () => api.getAgents(),
  });
}

export function useTasks(status?: string) {
  return useQuery<Task[]>({
    queryKey: queryKeys.tasks(status),
    queryFn: () => api.getTasks(status),
  });
}

export function useDashboardStats() {
  return useQuery<DashboardStat[]>({
    queryKey: queryKeys.dashboardStats,
    queryFn: () => api.getDashboardStats(),
  });
}

export function useAnalytics() {
  return useQuery<PlatformAnalytics[]>({
    queryKey: queryKeys.analytics,
    queryFn: () => api.getAnalytics(),
  });
}

export function useProducts() {
  return useQuery<Product[]>({
    queryKey: queryKeys.products,
    queryFn: () => api.getProducts(),
  });
}

export function useCampaigns() {
  return useQuery<Campaign[]>({
    queryKey: queryKeys.campaigns,
    queryFn: () => api.getCampaigns(),
  });
}

export function useLandingContent() {
  return useQuery<LandingContent>({
    queryKey: queryKeys.landing,
    queryFn: () => api.getLandingContent(),
    staleTime: 5 * 60_000,
  });
}

export function useNotifications() {
  return useQuery<Notification[]>({
    queryKey: queryKeys.notifications,
    queryFn: () => api.getNotifications(),
  });
}

export function useCurrentUser() {
  return useQuery<User>({
    queryKey: queryKeys.currentUser,
    queryFn: () => api.getCurrentUser(),
  });
}

export function useConnectPlatform() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (platformId: PlatformId) => api.connectPlatform(platformId),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.platforms }),
  });
}

export function useDisconnectPlatform() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (platformId: PlatformId) => api.disconnectPlatform(platformId),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.platforms }),
  });
}

export function useActivateAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (agentId: string) => api.activateAgent(agentId),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.agents }),
  });
}

export function usePauseAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (agentId: string) => api.pauseAgent(agentId),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.agents }),
  });
}

// =============================================================================
// Stadio B
// =============================================================================

// --- Social Media ----------------------------------------------------------

export function usePosts(platform?: PlatformId) {
  return useQuery<Post[]>({
    queryKey: queryKeys.posts(platform),
    queryFn: () => api.getPosts(platform),
  });
}

export function useSocialSummary() {
  return useQuery<SocialSummary>({
    queryKey: queryKeys.socialSummary,
    queryFn: () => api.getSocialSummary(),
  });
}

export function useScheduledPosts(platform?: PlatformId) {
  return useQuery<ScheduledPost[]>({
    queryKey: queryKeys.scheduledPosts(platform),
    queryFn: () => api.getScheduledPosts(platform),
  });
}

export function useFollowerSeries(platform: PlatformId) {
  return useQuery<AnalyticsPoint[]>({
    queryKey: queryKeys.followerSeries(platform),
    queryFn: () => api.getFollowerSeries(platform),
  });
}

export function useEngagementByPlatform() {
  return useQuery<{ platform: PlatformId; value: number }[]>({
    queryKey: queryKeys.engagementByPlatform,
    queryFn: () => api.getEngagementByPlatform(),
  });
}

export function usePostDistribution() {
  return useQuery<{ kind: PostKind; value: number }[]>({
    queryKey: queryKeys.postDistribution,
    queryFn: () => api.getPostDistribution(),
  });
}

export function useCreatePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { platform: PlatformId; text: string }) => api.createPost(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["posts"] }),
  });
}

// --- Agenti (dettaglio e log) ----------------------------------------------

export function useAgentDetail(agentId: string) {
  return useQuery<AgentDetail | null>({
    queryKey: queryKeys.agentDetail(agentId),
    queryFn: () => api.getAgentDetail(agentId),
    enabled: Boolean(agentId),
  });
}

export function useAgentLogs(agentId: string) {
  return useQuery<AgentLog[]>({
    queryKey: queryKeys.agentLogs(agentId),
    queryFn: () => api.getAgentLogs(agentId),
    enabled: Boolean(agentId),
  });
}

export function useCreateAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; type: Agent["type"] }) => api.createAgent(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.agents }),
  });
}

export function useUpdateAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (agentId: string) => api.updateAgent(agentId),
    onSuccess: (_data, agentId) => {
      qc.invalidateQueries({ queryKey: queryKeys.agents });
      qc.invalidateQueries({ queryKey: queryKeys.agentDetail(agentId) });
    },
  });
}

// --- Outreach --------------------------------------------------------------

export function useOutreachSummary() {
  return useQuery<OutreachSummary>({
    queryKey: queryKeys.outreachSummary,
    queryFn: () => api.getOutreachSummary(),
  });
}

export function useOutreachCampaigns() {
  return useQuery<OutreachCampaign[]>({
    queryKey: queryKeys.outreachCampaigns,
    queryFn: () => api.getOutreachCampaigns(),
  });
}

export function useOutreachSequences(campaignId?: string) {
  return useQuery<OutreachSequenceStep[]>({
    queryKey: queryKeys.outreachSequences(campaignId),
    queryFn: () => api.getOutreachSequences(campaignId),
  });
}

export function useLeads() {
  return useQuery<Lead[]>({
    queryKey: queryKeys.leads,
    queryFn: () => api.getLeads(),
  });
}

export function useCreateOutreachCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string }) => api.createOutreachCampaign(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.outreachCampaigns }),
  });
}

// --- Sito Web --------------------------------------------------------------

export function useSiteOverview() {
  return useQuery<SiteOverview>({
    queryKey: queryKeys.siteOverview,
    queryFn: () => api.getSiteOverview(),
  });
}

export function useSitePages() {
  return useQuery<SitePage[]>({
    queryKey: queryKeys.sitePages,
    queryFn: () => api.getSitePages(),
  });
}

export function useSeoReport() {
  return useQuery<SeoReport>({
    queryKey: queryKeys.seoReport,
    queryFn: () => api.getSeoReport(),
  });
}

export function useContactSubmissions() {
  return useQuery<ContactSubmission[]>({
    queryKey: queryKeys.contactSubmissions,
    queryFn: () => api.getContactSubmissions(),
  });
}

export function usePublishSitePage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (pageId: string) => api.publishSitePage(pageId),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.sitePages }),
  });
}

// --- Annunci ---------------------------------------------------------------

export function useAdsSummary() {
  return useQuery<AdsSummary>({
    queryKey: queryKeys.adsSummary,
    queryFn: () => api.getAdsSummary(),
  });
}

export function useAdCampaigns() {
  return useQuery<AdCampaign[]>({
    queryKey: queryKeys.adCampaigns,
    queryFn: () => api.getAdCampaigns(),
  });
}

export function useAdCreatives() {
  return useQuery<AdCreative[]>({
    queryKey: queryKeys.adCreatives,
    queryFn: () => api.getAdCreatives(),
  });
}

export function useAdsSeries() {
  return useQuery<AdsPoint[]>({
    queryKey: queryKeys.adsSeries,
    queryFn: () => api.getAdsSeries(),
  });
}

export function useCreateAdCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string }) => api.createAdCampaign(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.adCampaigns }),
  });
}

// --- Prodotti --------------------------------------------------------------

export function useCreateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string }) => api.createProduct(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.products }),
  });
}

// --- Analisi ---------------------------------------------------------------

export function useInsights() {
  return useQuery<AgentInsight[]>({
    queryKey: queryKeys.insights,
    queryFn: () => api.getInsights(),
  });
}

export function useAgentActivitySeries() {
  return useQuery<AnalyticsPoint[]>({
    queryKey: queryKeys.agentActivitySeries,
    queryFn: () => api.getAgentActivitySeries(),
  });
}

// =============================================================================
// Stadio C — Impostazioni e Aiuto
// =============================================================================

// --- Profilo ---------------------------------------------------------------

export function useUserProfile() {
  return useQuery<UserProfile>({
    queryKey: queryKeys.userProfile,
    queryFn: () => api.getUserProfile(),
  });
}

export function useUpdateUserProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<UserProfile>) => api.updateUserProfile(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.userProfile }),
  });
}

// --- Fatturazione ----------------------------------------------------------

export function useInvoices() {
  return useQuery<Invoice[]>({
    queryKey: queryKeys.invoices,
    queryFn: () => api.getInvoices(),
  });
}

export function usePaymentMethods() {
  return useQuery<PaymentMethod[]>({
    queryKey: queryKeys.paymentMethods,
    queryFn: () => api.getPaymentMethods(),
  });
}

export function useCreditUsage() {
  return useQuery<{ used: number; total: number }>({
    queryKey: queryKeys.creditUsage,
    queryFn: () => api.getCreditUsage(),
  });
}

export function useAddPaymentMethod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { brand: string; last4: string }) => api.addPaymentMethod(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.paymentMethods }),
  });
}

export function useRemovePaymentMethod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (paymentMethodId: string) => api.removePaymentMethod(paymentMethodId),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.paymentMethods }),
  });
}

// --- Integrazioni ----------------------------------------------------------

export function useApiKeys() {
  return useQuery<ApiKey[]>({
    queryKey: queryKeys.apiKeys,
    queryFn: () => api.getApiKeys(),
  });
}

export function useCreateApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; environment: ApiKey["environment"] }) =>
      api.createApiKey(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.apiKeys }),
  });
}

export function useRevokeApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (apiKeyId: string) => api.revokeApiKey(apiKeyId),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.apiKeys }),
  });
}

export function useWebhooks() {
  return useQuery<Webhook[]>({
    queryKey: queryKeys.webhooks,
    queryFn: () => api.getWebhooks(),
  });
}

export function useCreateWebhook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { url: string; events: string[] }) => api.createWebhook(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.webhooks }),
  });
}

export function useRemoveWebhook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (webhookId: string) => api.removeWebhook(webhookId),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.webhooks }),
  });
}

// --- Notifiche -------------------------------------------------------------

export function useNotificationPreferences() {
  return useQuery<NotificationPreferences>({
    queryKey: queryKeys.notificationPreferences,
    queryFn: () => api.getNotificationPreferences(),
  });
}

export function usePlatformNotificationPreferences() {
  return useQuery<PlatformNotificationPreference[]>({
    queryKey: queryKeys.platformNotificationPreferences,
    queryFn: () => api.getPlatformNotificationPreferences(),
  });
}

export function useUpdateNotificationPreferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<NotificationPreferences>) =>
      api.updateNotificationPreferences(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.notificationPreferences }),
  });
}

// --- Aiuto -----------------------------------------------------------------

export function useHelpCategories() {
  return useQuery<HelpCategory[]>({
    queryKey: queryKeys.helpCategories,
    queryFn: () => api.getHelpCategories(),
  });
}

export function useFaqItems() {
  return useQuery<FaqItem[]>({
    queryKey: queryKeys.faqItems,
    queryFn: () => api.getFaqItems(),
  });
}

export function useHelpDocs() {
  return useQuery<HelpDoc[]>({
    queryKey: queryKeys.helpDocs,
    queryFn: () => api.getHelpDocs(),
  });
}

export function useServiceStatuses() {
  return useQuery<ServiceStatus[]>({
    queryKey: queryKeys.serviceStatuses,
    queryFn: () => api.getServiceStatuses(),
  });
}

export function useStatusUpdatedAt() {
  return useQuery<string>({
    queryKey: queryKeys.statusUpdatedAt,
    queryFn: () => api.getStatusUpdatedAt(),
  });
}
