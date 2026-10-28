import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import type {
  AiCapability,
  AiCatalog,
  AiChatResult,
  AppConnection,
  Flow,
  FlowRun,
  Project,
  SessionUser,
} from "./types";

export function useSession() {
  return useQuery<SessionUser | null>({
    queryKey: ["session"],
    queryFn: async () => {
      try {
        return await api.get<SessionUser>("/auth/session");
      } catch {
        return null;
      }
    },
    staleTime: 30_000,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { email: string; password: string }) =>
      api.post<SessionUser>("/auth/login", body),
    onSuccess: (user) => qc.setQueryData(["session"], user),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ ok: boolean }>("/auth/logout"),
    onSuccess: () => {
      qc.setQueryData(["session"], null);
      qc.clear();
    },
  });
}

export function useProjects() {
  return useQuery<Project[]>({
    queryKey: ["projects"],
    queryFn: () => api.get<Project[]>("/ap/projects"),
  });
}

export function useFlows(projectId?: string) {
  return useQuery<Flow[]>({
    queryKey: ["flows", projectId],
    enabled: !!projectId,
    queryFn: () => api.get<Flow[]>(`/ap/flows?projectId=${projectId}`),
  });
}

export function useCreateFlow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { projectId: string; displayName: string }) =>
      api.post<Flow>("/ap/flows", body),
    onSuccess: (_f, v) => qc.invalidateQueries({ queryKey: ["flows", v.projectId] }),
  });
}

export function useRuns(projectId?: string) {
  return useQuery<FlowRun[]>({
    queryKey: ["runs", projectId],
    enabled: !!projectId,
    queryFn: () => api.get<FlowRun[]>(`/ap/runs?projectId=${projectId}`),
  });
}

export function useRunCounts(projectId?: string) {
  return useQuery<{ status: string; count: number }[]>({
    queryKey: ["runs-count", projectId],
    enabled: !!projectId,
    queryFn: () => api.get<{ status: string; count: number }[]>(
      `/ap/runs/count?projectId=${projectId}`,
    ),
  });
}

export function useConnections(projectId?: string) {
  return useQuery<AppConnection[]>({
    queryKey: ["connections", projectId],
    enabled: !!projectId,
    queryFn: () => api.get<AppConnection[]>(`/ap/connections?projectId=${projectId}`),
  });
}

export function useAiCatalog(capability: AiCapability) {
  return useQuery<AiCatalog>({
    queryKey: ["ai-catalog", capability],
    queryFn: () => api.get<AiCatalog>(`/ai/catalog?capability=${capability}`),
    staleTime: 5 * 60_000,
  });
}

export function useAiChat() {
  return useMutation({
    mutationFn: (body: {
      capability: AiCapability;
      prompt: string;
      model?: string;
      preferFree?: boolean;
      fileUrl?: string;
    }) => api.post<AiChatResult>("/ai/chat", body),
  });
}
