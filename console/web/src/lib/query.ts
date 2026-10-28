import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import type {
  AiCapability,
  AiCatalog,
  AiChatResult,
  AppConnection,
  Asset,
  AssetFamily,
  AssetKind,
  CreditBalance,
  ExecuteResult,
  Flow,
  FlowRun,
  Project,
  RunDetail,
  SessionUser,
  StageSpec,
  UsageEvents,
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

// --- Pipeline / libreria asset -----------------------------------------------

export function useStages() {
  return useQuery<{ stages: StageSpec[] }>({
    queryKey: ["pipeline-stages"],
    queryFn: () => api.get<{ stages: StageSpec[] }>("/pipeline/stages"),
    staleTime: 10 * 60_000,
  });
}

export function usePipelineRuns(opts: { stage?: string; status?: string } = {}) {
  const qs = new URLSearchParams();
  if (opts.stage) qs.set("stage", opts.stage);
  if (opts.status) qs.set("status", opts.status);
  const suffix = qs.toString() ? `?${qs}` : "";
  return useQuery<RunDetail["run"][]>({
    queryKey: ["pipeline-runs", opts.stage ?? "", opts.status ?? ""],
    queryFn: () => api.get<RunDetail["run"][]>(`/pipeline/runs${suffix}`),
  });
}

export function useRunDetail(runId?: string) {
  return useQuery<RunDetail>({
    queryKey: ["pipeline-run", runId],
    enabled: !!runId,
    queryFn: () => api.get<RunDetail>(`/pipeline/runs/${runId}`),
  });
}

/** Libreria deliverable raggruppata per famiglia (versioning). */
export function useAssetFamilies(opts: { runId?: string; kind?: AssetKind } = {}) {
  const qs = new URLSearchParams();
  if (opts.runId) qs.set("runId", opts.runId);
  if (opts.kind) qs.set("kind", opts.kind);
  const suffix = qs.toString() ? `?${qs}` : "";
  return useQuery<AssetFamily[]>({
    queryKey: ["asset-families", opts.runId ?? "", opts.kind ?? ""],
    queryFn: () => api.get<AssetFamily[]>(`/pipeline/assets/families${suffix}`),
  });
}

/** Storico revisioni di una famiglia (dalla piu' recente). */
export function useAssetVersions(assetId?: string) {
  return useQuery<{ versions: Asset[] }>({
    queryKey: ["asset-versions", assetId],
    enabled: !!assetId,
    queryFn: () => api.get<{ versions: Asset[] }>(`/pipeline/assets/${assetId}/versions`),
  });
}

function useAssetInvalidate() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["asset-families"] });
    qc.invalidateQueries({ queryKey: ["asset-versions"] });
  };
}

/** Sottomette una bozza alla revisione umana (draft -> in_review). */
export function useSubmitAsset() {
  const invalidate = useAssetInvalidate();
  return useMutation({
    mutationFn: (assetId: string) => api.post<Asset>(`/pipeline/assets/${assetId}/submit`),
    onSuccess: invalidate,
  });
}

/** Approva o rifiuta un deliverable in revisione (HITL). */
export function useDecideAsset() {
  const invalidate = useAssetInvalidate();
  return useMutation({
    mutationFn: (v: { assetId: string; decision: "approved" | "rejected" }) =>
      api.post<Asset>(`/pipeline/assets/${v.assetId}/decide`, { decision: v.decision }),
    onSuccess: invalidate,
  });
}

// --- Pipeline run (esecuzione + HITL) e crediti ------------------------------

function useRunInvalidate() {
  const qc = useQueryClient();
  return (runId: string) => {
    qc.invalidateQueries({ queryKey: ["pipeline-runs"] });
    qc.invalidateQueries({ queryKey: ["pipeline-run", runId] });
    qc.invalidateQueries({ queryKey: ["asset-families"] });
    qc.invalidateQueries({ queryKey: ["credit-balance"] });
    qc.invalidateQueries({ queryKey: ["usage-events"] });
  };
}

/** Apre un nuovo run di pipeline per uno stadio. */
export function useOpenRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { stage: string; title?: string; brief?: unknown }) =>
      api.post<RunDetail["run"]>("/pipeline/runs", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pipeline-runs"] }),
  });
}

/** Esegue i task pendenti del run (executor iniettato lato server). */
export function useExecuteRun() {
  const invalidate = useRunInvalidate();
  return useMutation({
    mutationFn: (v: { runId: string; results?: Record<string, unknown>; continueOnError?: boolean }) =>
      api.post<ExecuteResult>(`/pipeline/runs/${v.runId}/execute`, {
        results: v.results,
        continueOnError: v.continueOnError,
      }),
    onSuccess: (_r, v) => invalidate(v.runId),
  });
}

/** Approva un run in revisione (HITL). */
export function useApproveRun() {
  const invalidate = useRunInvalidate();
  return useMutation({
    mutationFn: (runId: string) => api.post<RunDetail["run"]>(`/pipeline/runs/${runId}/approve`),
    onSuccess: (_r, runId) => invalidate(runId),
  });
}

/** Consegna un run approvato (marca delivered gli asset approvati). */
export function useDeliverRun() {
  const invalidate = useRunInvalidate();
  return useMutation({
    mutationFn: (runId: string) => api.post<RunDetail["run"]>(`/pipeline/runs/${runId}/deliver`),
    onSuccess: (_r, runId) => invalidate(runId),
  });
}

/** Riporta un run fallito in lavorazione. */
export function useRetryRun() {
  const invalidate = useRunInvalidate();
  return useMutation({
    mutationFn: (runId: string) => api.post<RunDetail["run"]>(`/pipeline/runs/${runId}/retry`),
    onSuccess: (_r, runId) => invalidate(runId),
  });
}

/** Saldo crediti + quota del tenant (display, P0.5). */
export function useCreditBalance() {
  return useQuery<CreditBalance>({
    queryKey: ["credit-balance"],
    queryFn: () => api.get<CreditBalance>("/ai/balance"),
    refetchInterval: 30_000,
  });
}

/** Ultimi eventi di consumo del tenant (display, P0.5). */
export function useUsageEvents(limit = 50) {
  return useQuery<UsageEvents>({
    queryKey: ["usage-events", limit],
    queryFn: () => api.get<UsageEvents>(`/ai/usage?limit=${limit}`),
  });
}
