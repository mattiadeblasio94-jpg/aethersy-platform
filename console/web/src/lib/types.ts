// Tipi condivisi con il BFF. Rispecchiano le entita' Activepieces 0.92.x
// (verificate su /api/v1/docs) e le risposte del BFF.

export interface SessionUser {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  platformRole?: "ADMIN" | "OPERATOR" | "MEMBER" | string;
  verified?: boolean;
}

export interface Project {
  id: string;
  displayName: string;
  externalId?: string;
}

export interface Flow {
  id: string;
  displayName: string;
  projectId: string;
  status: "ENABLED" | "DISABLED" | string;
  publishedVersionId?: string | null;
  created?: string;
  updated?: string;
}

export interface FlowRun {
  id: string;
  flowId: string;
  flowDisplayName?: string;
  projectId: string;
  status:
    | "SUCCEEDED"
    | "FAILED"
    | "RUNNING"
    | "PAUSED"
    | "QUEUED"
    | "TIMEOUT"
    | "CANCELED"
    | string;
  startTime?: string;
  finishTime?: string | null;
  environment?: string;
}

export interface AppConnection {
  id: string;
  displayName: string;
  pieceName?: string;
  pieceDisplayName?: string;
  status?: string;
  type?: string;
}

export interface RunCount {
  count: number;
  status: string;
}

export type AiCapability = "text" | "image" | "audio" | "video";

export interface AiModel {
  id: string;
  name: string;
  contextLength: number | null;
  free: boolean;
  capabilities: AiCapability[];
  pricing: { prompt: number; completion: number };
}

export interface AiCatalog {
  capability: AiCapability;
  selected: string;
  models: AiModel[];
}

export interface AiChatResult {
  model: string;
  capability: AiCapability;
  answer: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null;
  latencyMs: number;
  attempts?: { model: string; error: string }[];
}

// --- Pipeline / libreria asset (P0.3, P0.4) ----------------------------------

export type StageId = "brand" | "website" | "content" | "social";

export interface StageSpec {
  id: StageId;
  order: number;
  title: string;
  description: string;
  droids: string[];
  tasks: { droid: string; title: string }[];
  deliverables: { kind: AssetKind; name: string }[];
  capabilities: string[];
  intensity: string;
}

export type AssetKind =
  | "document"
  | "image"
  | "video"
  | "audio"
  | "code"
  | "link"
  | "dataset"
  | "archive";

export type AssetStatus = "draft" | "in_review" | "approved" | "rejected" | "delivered";

export interface Asset {
  id: string;
  tenant_id: string;
  run_id: string | null;
  task_id: string | null;
  kind: AssetKind;
  name: string;
  storage_key: string;
  mime: string | null;
  size_bytes: string | null;
  version: number;
  status: AssetStatus;
  meta: unknown;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
}

/** Una riga della libreria: un deliverable con le sue revisioni. */
export interface AssetFamily {
  key: string;
  runId: string | null;
  kind: AssetKind;
  name: string;
  latestVersion: number;
  latestStatus: AssetStatus;
  latestAssetId: string;
  approvedVersion: number | null;
  versions: number;
  updatedAt: string;
}

export interface PipelineRun {
  id: string;
  tenant_id: string;
  stage: StageId;
  status: "draft" | "in_progress" | "in_review" | "approved" | "delivered" | "failed";
  title: string;
  brief: unknown;
  context: unknown;
  approved_by: string | null;
  approved_at: string | null;
  delivered_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgentTask {
  id: string;
  run_id: string;
  seq: number;
  droid: string;
  title: string;
  status: "pending" | "running" | "done" | "failed" | "skipped";
  flow_run_id: string | null;
  output: unknown;
  error: string | null;
}

export interface RunUsageSummary {
  byCapability: {
    capability: string;
    requests: number;
    credits: number;
    price_eur: number;
    provider_cost_usd: number;
  }[];
  totals: { requests: number; credits: number; price_eur: number; provider_cost_usd: number };
}

export interface RunDetail {
  run: PipelineRun;
  tasks: AgentTask[];
  assets: Asset[];
  usage: RunUsageSummary;
}
