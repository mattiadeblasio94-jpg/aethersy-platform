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
