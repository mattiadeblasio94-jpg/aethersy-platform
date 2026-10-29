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
  roster: ["real", "roster"] as const,
  droid: (id: string) => ["real", "roster", id] as const,
  schedule: ["real", "schedule"] as const,
  conversations: ["real", "conversations"] as const,
  conversation: (id: string) => ["real", "conversation", id] as const,
  runs: ["real", "runs"] as const,
  run: (id: string) => ["real", "run", id] as const,
  assets: (runId?: string) => ["real", "assets", runId ?? "all"] as const,
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

export { platformApi };
