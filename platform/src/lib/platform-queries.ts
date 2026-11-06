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
  socialPosts: ["real", "social-posts"] as const,
  socialScheduled: ["real", "social-scheduled"] as const,
  socialSummary: ["real", "social-summary"] as const,
  tasks: ["real", "tasks"] as const,
  goals: ["real", "goals"] as const,
  memory: ["real", "memory"] as const,
  businessCatalog: ["real", "business-catalog"] as const,
  usage: ["real", "usage"] as const,
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
    onSuccess: () => qc.invalidateQueries({ queryKey: realKeys.platforms }),
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
