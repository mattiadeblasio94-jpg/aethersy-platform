// =============================================================================
// React Query hooks sulle superfici REALI (BFF Console). Separati da
// `lib/queries.ts` (mock-first) per non mescolare dati reali e simulati durante
// la migrazione incrementale della SPA.
// =============================================================================

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { platformApi } from "./platform-api";

export const realKeys = {
  balance: ["real", "balance"] as const,
  overview: ["real", "overview"] as const,
  opportunities: ["real", "opportunities"] as const,
  kanban: ["real", "opportunities", "kanban"] as const,
  roster: ["real", "roster"] as const,
  droid: (id: string) => ["real", "roster", id] as const,
  schedule: ["real", "schedule"] as const,
  conversations: ["real", "conversations"] as const,
  conversation: (id: string) => ["real", "conversation", id] as const,
  runs: ["real", "runs"] as const,
  run: (id: string) => ["real", "run", id] as const,
  assets: (runId?: string) => ["real", "assets", runId ?? "all"] as const,
  library: ["real", "library"] as const,
  account: ["real", "account"] as const,
  faq: ["real", "faq"] as const,
  platforms: ["real", "platforms"] as const,
  connectors: ["real", "connectors"] as const,
  socialPosts: ["real", "social-posts"] as const,
  socialScheduled: ["real", "social-scheduled"] as const,
  socialSummary: ["real", "social-summary"] as const,
  tasks: ["real", "tasks"] as const,
  goals: ["real", "goals"] as const,
  memory: ["real", "memory"] as const,
  businessCatalog: ["real", "business-catalog"] as const,
  usage: ["real", "usage"] as const,
  profile: ["real", "profile"] as const,
  preferences: ["real", "preferences"] as const,
  products: ["real", "products"] as const,
  leads: ["real", "leads"] as const,
  integrations: ["real", "integrations"] as const,
  notifications: ["real", "notifications"] as const,
  webhookDeliveries: ["real", "webhook-deliveries"] as const,
  builderAgents: ["real", "builder-agents"] as const,
  builderTasks: ["real", "builder-tasks"] as const,
  builderProjects: ["real", "builder-projects"] as const,
  builderArtifacts: ["real", "builder-artifacts"] as const,
};

export function useBalance() {
  return useQuery({ queryKey: realKeys.balance, queryFn: () => platformApi.getBalance() });
}

export function useOverview() {
  return useQuery({
    queryKey: realKeys.overview,
    queryFn: () => platformApi.getOverview(),
    refetchInterval: 20_000,
  });
}

export function useOpportunities(stage?: string) {
  return useQuery({
    queryKey: [...realKeys.opportunities, stage ?? "all"] as const,
    queryFn: () => platformApi.getOpportunities(stage),
  });
}

export function useKanbanBoard(stage?: string) {
  return useQuery({
    queryKey: [...realKeys.kanban, stage ?? "all"] as const,
    queryFn: () => platformApi.getKanbanBoard(stage),
  });
}

export function useRoster() {
  return useQuery({ queryKey: realKeys.roster, queryFn: () => platformApi.getRoster() });
}

export function useSchedule(status?: string) {
  return useQuery({
    queryKey: [...realKeys.schedule, status ?? "all"] as const,
    queryFn: () => platformApi.getSchedule(status),
  });
}

export function useConversations() {
  return useQuery({
    queryKey: realKeys.conversations,
    queryFn: () => platformApi.listConversations().then((r) => r.conversations),
  });
}

export function useConversation(id: string | null) {
  return useQuery({
    queryKey: realKeys.conversation(id ?? "none"),
    queryFn: () => platformApi.getConversation(id as string),
    enabled: Boolean(id),
    refetchInterval: 4_000,
  });
}

export function useRuns() {
  return useQuery({ queryKey: realKeys.runs, queryFn: () => platformApi.listRuns({ limit: 50 }) });
}

export function useRun(runId: string | null) {
  return useQuery({
    queryKey: realKeys.run(runId ?? "none"),
    queryFn: () => platformApi.getRun(runId as string),
    enabled: Boolean(runId),
    refetchInterval: 3_000,
  });
}

/** Invia un turno alla chat centrale (motore agenti). */
export function useSendMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { text: string; conversationId?: string | null }) =>
      platformApi.sendMessage(input),
    onSuccess: (turn) => {
      qc.invalidateQueries({ queryKey: realKeys.conversation(turn.conversationId) });
      qc.invalidateQueries({ queryKey: realKeys.conversations });
      qc.invalidateQueries({ queryKey: realKeys.overview });
      qc.invalidateQueries({ queryKey: realKeys.runs });
      qc.invalidateQueries({ queryKey: realKeys.roster });
    },
  });
}

export function useCreateConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (title?: string) => platformApi.createConversation(title),
    onSuccess: () => qc.invalidateQueries({ queryKey: realKeys.conversations }),
  });
}

export function useDecideAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { assetId: string; decision: "approved" | "rejected"; runId?: string }) =>
      platformApi.decideAsset(input.assetId, input.decision),
    onSuccess: (_data, variables) => {
      if (variables.runId) qc.invalidateQueries({ queryKey: realKeys.run(variables.runId) });
      qc.invalidateQueries({ queryKey: realKeys.overview });
    },
  });
}

export function useExecuteRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (runId: string) => platformApi.executeRun(runId, { continueOnError: true }),
    onSuccess: (_data, runId) => {
      qc.invalidateQueries({ queryKey: realKeys.run(runId) });
      qc.invalidateQueries({ queryKey: realKeys.roster });
      qc.invalidateQueries({ queryKey: realKeys.overview });
    },
  });
}

export function useLibrary() {
  return useQuery({
    queryKey: realKeys.library,
    queryFn: () => platformApi.getLibrary(),
  });
}

export function useAccount() {
  return useQuery({
    queryKey: realKeys.account,
    queryFn: () => platformApi.getAccount(),
  });
}

export function useFaq(category?: string) {
  return useQuery({
    queryKey: [...realKeys.faq, category ?? "all"] as const,
    queryFn: () => platformApi.getFaq(category),
  });
}

// --- Piattaforme / connessioni social ---------------------------------------

export function usePlatforms() {
  return useQuery({
    queryKey: realKeys.platforms,
    queryFn: () => platformApi.getPlatforms(),
  });
}

export function useConnectPlatform() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => platformApi.connectPlatform(id),
    onSuccess: (result) => {
      // Il collegamento reale avviene sul provider: il browser deve seguire
      // il redirect (login -> consenso -> ritorno alla piattaforma).
      if (result?.redirect) {
        window.location.assign(result.redirect);
        return;
      }
      qc.invalidateQueries({ queryKey: realKeys.platforms });
    },
  });
}

// --- Connettori ---------------------------------------------------------------

export function useConnectors() {
  return useQuery({
    queryKey: realKeys.connectors,
    queryFn: () => platformApi.getConnectors(),
  });
}

export function useSaveConnectorApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; fields: Record<string, string> }) =>
      platformApi.saveConnectorApiKey(input.id, input.fields),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: realKeys.connectors });
      qc.invalidateQueries({ queryKey: realKeys.platforms });
    },
  });
}

export function useTestConnector() {
  return useMutation({
    mutationFn: (id: string) => platformApi.testConnector(id),
  });
}

export function useDisconnectConnector() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => platformApi.disconnectConnector(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: realKeys.connectors });
      qc.invalidateQueries({ queryKey: realKeys.platforms });
    },
  });
}

export function useDisconnectPlatform() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => platformApi.disconnectPlatform(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: realKeys.platforms }),
  });
}

// --- Post social ------------------------------------------------------------

export function useSocialPosts() {
  return useQuery({
    queryKey: realKeys.socialPosts,
    queryFn: () => platformApi.getSocialPosts(),
  });
}

export function useSocialScheduledPosts() {
  return useQuery({
    queryKey: realKeys.socialScheduled,
    queryFn: () => platformApi.getSocialScheduledPosts(),
  });
}

export function useSocialSummary() {
  return useQuery({
    queryKey: realKeys.socialSummary,
    queryFn: () => platformApi.getSocialSummary(),
  });
}

// --- Task -------------------------------------------------------------------

export function useTasks() {
  return useQuery({
    queryKey: realKeys.tasks,
    queryFn: () => platformApi.getTasks(),
  });
}

// --- Agenti attiva/pausa ----------------------------------------------------

export function useActivateAgent() {  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => platformApi.activateAgent(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: realKeys.platforms });
      qc.invalidateQueries({ queryKey: realKeys.tasks });
    },
  });
}

export function usePauseAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => platformApi.pauseAgent(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: realKeys.platforms });
      qc.invalidateQueries({ queryKey: realKeys.tasks });
    },
  });
}

export { platformApi };

// --- Obiettivi (business.goal) ---------------------------------------------

export function useGoals(status?: string) {
  return useQuery({
    queryKey: [...realKeys.goals, status ?? "all"] as const,
    queryFn: () => platformApi.getGoals(status),
  });
}

export function useCreateGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      title: string;
      description?: string;
      status?: string;
      priority?: number;
      metric?: string;
      targetDate?: string | null;
    }) => platformApi.createGoal(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: realKeys.goals });
      qc.invalidateQueries({ queryKey: realKeys.overview });
    },
  });
}

export function useUpdateGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      id: string;
      body: {
        title?: string;
        description?: string;
        status?: string;
        priority?: number;
        metric?: string;
        targetDate?: string | null;
      };
    }) => platformApi.updateGoal(input.id, input.body),
    onSuccess: () => qc.invalidateQueries({ queryKey: realKeys.goals }),
  });
}

export function useDeleteGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => platformApi.deleteGoal(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: realKeys.goals }),
  });
}

// --- Memoria (business.memory) ----------------------------------------------

export function useMemory(query?: { kind?: string; search?: string; pinned?: string }) {
  return useQuery({
    queryKey: [...realKeys.memory, query?.kind ?? "all", query?.search ?? ""] as const,
    queryFn: () => platformApi.getMemory(query),
  });
}

export function useCreateMemory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      kind: string;
      title: string;
      content?: string;
      source?: string;
      tags?: string[];
      pinned?: boolean;
    }) => platformApi.createMemory(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: realKeys.memory }),
  });
}

export function useUpdateMemory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      id: string;
      body: {
        kind?: string;
        title?: string;
        content?: string;
        source?: string;
        tags?: string[];
        pinned?: boolean;
      };
    }) => platformApi.updateMemory(input.id, input.body),
    onSuccess: () => qc.invalidateQueries({ queryKey: realKeys.memory }),
  });
}

export function useDeleteMemory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => platformApi.deleteMemory(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: realKeys.memory }),
  });
}

export function useBusinessCatalog() {
  return useQuery({
    queryKey: realKeys.businessCatalog,
    queryFn: () => platformApi.getBusinessCatalog(),
  });
}

// --- Consumo (crediti) -------------------------------------------------------

export function useUsage(limit = 50) {
  return useQuery({
    queryKey: [...realKeys.usage, limit] as const,
    queryFn: () => platformApi.getUsage(limit),
  });
}

// --- Agenda: pausa / riattiva / elimina --------------------------------------

export function useUpdateSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      id: string;
      body: { status?: string; title?: string; cron?: string | null; runAt?: string | null };
    }) => platformApi.updateSchedule(input.id, input.body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: realKeys.schedule });
      qc.invalidateQueries({ queryKey: realKeys.overview });
    },
  });
}

export function useDeleteSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => platformApi.deleteSchedule(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: realKeys.schedule });
      qc.invalidateQueries({ queryKey: realKeys.overview });
    },
  });
}

// --- Profilo (schema `auth`, dati reali) -------------------------------------

export function useProfile() {
  return useQuery({
    queryKey: realKeys.profile,
    queryFn: () => platformApi.getProfile().then((r) => r.profile),
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<{
      firstName: string;
      lastName: string;
      company: string;
      roleTitle: string;
      timezone: string;
      locale: string;
    }>) => platformApi.updateProfile(body),
    onSuccess: (data) => {
      qc.setQueryData(realKeys.profile, data.profile);
    },
  });
}

// --- Preferenze di notifica ---------------------------------------------------

export function usePreferences() {
  return useQuery({
    queryKey: realKeys.preferences,
    queryFn: () => platformApi.getPreferences().then((r) => r.preferences),
  });
}

export function useUpdatePreferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<{
      emailDigest: "off" | "daily" | "weekly";
      runUpdates: boolean;
      leadAlerts: boolean;
      budgetAlerts: boolean;
      channelEmail: boolean;
      channelPush: boolean;
      quietHours: boolean;
    }>) => platformApi.updatePreferences(body),
    onSuccess: (data) => {
      qc.setQueryData(realKeys.preferences, data.preferences);
    },
  });
}

// --- Catalogo prodotti (business.product) --------------------------------------

export function useProducts() {
  return useQuery({ queryKey: realKeys.products, queryFn: () => platformApi.getProducts() });
}

export function useCreateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; kind?: string; description?: string; priceCents?: number; sku?: string }) =>
      platformApi.createProduct(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: realKeys.products });
      qc.invalidateQueries({ queryKey: realKeys.businessCatalog });
    },
  });
}

export function useUpdateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      id: string;
      body: { name?: string; kind?: string; description?: string; priceCents?: number; status?: string };
    }) => platformApi.updateProduct(input.id, input.body),
    onSuccess: () => qc.invalidateQueries({ queryKey: realKeys.products }),
  });
}

export function useDeleteProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => platformApi.deleteProduct(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: realKeys.products }),
  });
}

// --- Lead reali (pipeline.lead) ----------------------------------------------

export function useLeads() {
  return useQuery({
    queryKey: realKeys.leads,
    queryFn: () => platformApi.getLeads().then((r) => r.leads),
  });
}

export function useLeadCounts() {
  return useQuery({
    queryKey: [...realKeys.leads, "counts"] as const,
    queryFn: () => platformApi.getLeads().then((r) => r.counts),
  });
}

export function useUpdateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; body: { status?: string; note?: string } }) =>
      platformApi.updateLead(input.id, input.body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: realKeys.leads });
      qc.invalidateQueries({ queryKey: realKeys.overview });
    },
  });
}

// --- Integrazioni (canali OAuth/webhook collegati) ---------------------------

export function useWebhookDeliveries() {
  return useQuery({
    queryKey: realKeys.webhookDeliveries,
    queryFn: () => platformApi.getWebhookDeliveries(),
  });
}

export function useNotifications() {
  return useQuery({
    queryKey: realKeys.notifications,
    queryFn: () => platformApi.getNotifications(),
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => platformApi.markNotificationRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: realKeys.notifications }),
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => platformApi.markAllNotificationsRead(),
    onSuccess: () => qc.invalidateQueries({ queryKey: realKeys.notifications }),
  });
}

export function useIntegrations() {
  return useQuery({ queryKey: realKeys.integrations, queryFn: () => platformApi.getIntegrations() });
}

export function useSaveIntegration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      provider: string;
      kind?: "oauth" | "webhook" | "api_key";
      label?: string;
      secret?: string;
      scopes?: string[];
    }) => platformApi.saveIntegration(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: realKeys.integrations }),
  });
}

export function useSaveWebhook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { url: string; signingSecret?: string; label?: string }) =>
      platformApi.saveWebhook(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: realKeys.integrations }),
  });
}

export function useTestIntegration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; message?: string }) => platformApi.testIntegration(input.id, input.message),
    onSuccess: () => qc.invalidateQueries({ queryKey: realKeys.integrations }),
  });
}

export function useRevokeIntegration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => platformApi.revokeIntegration(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: realKeys.integrations }),
  });
}

// --- Agenti specialistici e task (Universal Builder Platform) ----------------

export function useBuilderAgents() {
  return useQuery({
    queryKey: realKeys.builderAgents,
    queryFn: () => platformApi.getBuilderAgents().then((r) => r.available),
  });
}

export function useBuilderTasks() {
  return useQuery({
    queryKey: realKeys.builderTasks,
    queryFn: () => platformApi.getBuilderTasks().then((r) => r.tasks),
  });
}

export function useDeleteBuilderTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => platformApi.deleteBuilderTask(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: realKeys.builderTasks });
      void qc.invalidateQueries({ queryKey: realKeys.builderArtifacts });
    },
  });
}

export function useDeleteBuilderProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => platformApi.deleteBuilderProject(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: realKeys.builderProjects });
      void qc.invalidateQueries({ queryKey: realKeys.builderTasks });
      void qc.invalidateQueries({ queryKey: realKeys.builderArtifacts });
    },
  });
}

export function useBuilderProjects() {
  return useQuery({
    queryKey: realKeys.builderProjects,
    queryFn: () => platformApi.getBuilderProjects().then((r) => r.projects),
  });
}

/** Crea un agente specialistico: progetto (se assente) + task eseguibile. */
export function useCreateBuilderTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      agent: string;
      title: string;
      description?: string;
      type?: string;
      projectId?: string | null;
      priority?: number;
    }) => {
      let projectId = input.projectId ?? null;
      if (!projectId) {
        const projects = await platformApi.getBuilderProjects().then((r) => r.projects);
        projectId = projects[0]?.id ?? null;
      }
      if (!projectId) {
        const created = await platformApi.createBuilderProject({
          name: input.title.slice(0, 120) || "Attivita' Aethersy",
          description: input.description ?? "Progetto creato dalla piattaforma",
          type: "other",
        });
        projectId = created.project.id;
      }
      return platformApi.createBuilderTask({
        project_id: projectId,
        type: input.type ?? input.agent,
        title: input.title,
        description: input.description,
        spec: {
          idea: input.description || input.title,
          agent: input.agent,
          project_type: "saas",
        },
        estimated_credits: 20,
        priority: input.priority ?? 3,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: realKeys.builderTasks });
      qc.invalidateQueries({ queryKey: realKeys.builderProjects });
      qc.invalidateQueries({ queryKey: realKeys.roster });
    },
  });
}

// --- Artefatti prodotti dagli agenti (builder) ---------------------------------

export function useBuilderArtifacts() {
  return useQuery({
    queryKey: realKeys.builderArtifacts,
    queryFn: () => platformApi.getBuilderArtifacts().then((r) => r.artifacts),
  });
}
