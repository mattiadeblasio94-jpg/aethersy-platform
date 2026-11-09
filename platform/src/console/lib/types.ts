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

export interface ExecuteOutcome {
  taskId: string;
  seq: number;
  droid: string;
  status: string;
  flowRunId: string;
  credits: number;
  assets: number;
  error: string | null;
}

export interface ExecuteResult {
  run: PipelineRun | null;
  outcomes: ExecuteOutcome[];
  credits: number;
  failed: boolean;
}

// --- Crediti / metering (P0.5) ----------------------------------------------

export interface CreditQuota {
  limitCredits: number;
  window: "day" | "month";
  softPct: number;
  consumed: number;
}

export interface CreditBalance {
  metering: boolean;
  tenant?: string;
  balance: number | null;
  reserved?: number;
  available: number | null;
  quota: CreditQuota | null;
}

export interface UsageEvent {
  id: string;
  created_at: string;
  capability: string;
  provider: string | null;
  model: string | null;
  unit: string;
  billable_units: number | string;
  input_tokens: number | null;
  output_tokens: number | null;
  price_eur: number | string;
  credits: number;
  status: string;
  latency_ms: number | null;
  source: string | null;
  flow_run_id: string | null;
  request_id: string | null;
}

export interface UsageEvents {
  metering: boolean;
  events: UsageEvent[];
}

// --- Lead + integrazioni (P0.6) ----------------------------------------------

export type LeadStatus = "new" | "contacted" | "qualified" | "won" | "lost" | "spam";

export interface Lead {
  id: string;
  tenant_id: string;
  run_id: string | null;
  source: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  message: string | null;
  utm: unknown;
  payload: unknown;
  status: LeadStatus;
  notified_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeadsResponse {
  leads: Lead[];
  counts: { status: string; count: number }[];
}

export type IntegrationKind = "oauth" | "webhook" | "api_key";

export interface IntegrationCredential {
  id: string;
  tenant_id: string;
  provider: string;
  kind: IntegrationKind;
  label: string;
  scopes: string[];
  status: "active" | "revoked" | "error";
  meta: unknown;
  created_at: string;
  updated_at: string;
}

// --- Piattaforma (Business Pulse, modello pazi.ai adattato) ------------------

export type OpportunityState =
  | "open"
  | "in_progress"
  | "awaiting_input"
  | "ready"
  | "done"
  | "error";

export interface OpportunityStateMeta {
  state: OpportunityState;
  label: string;
  tone: "neutral" | "info" | "warning" | "success" | "danger";
  needsHuman: boolean;
}

export interface OpportunityRun {
  id: string;
  stage: StageId;
  title: string;
  status: PipelineRun["status"];
  opportunity: OpportunityStateMeta;
  approved_by: string | null;
  created_at: string;
  updated_at: string;
}

export type ScheduleStatus = "scheduled" | "paused" | "done" | "canceled";
export type ScheduleKind = "pipeline" | "social" | "report" | "reminder";

export interface ScheduleEntry {
  id: string;
  tenant_id: string;
  run_id: string | null;
  stage: string;
  title: string;
  kind: ScheduleKind;
  cron: string | null;
  run_at: string | null;
  timezone: string;
  status: ScheduleStatus;
  meta: unknown;
  last_run_at: string | null;
  created_at: string;
  updated_at: string;
  nextRunAt: string | null;
}

export interface PulseCounters {
  runs: { total: number; byStatus: Record<string, number>; open: number; awaitingInput: number };
  tasks: { total: number; running: number; failed: number; pending: number };
  assets: { total: number; inReview: number; approved: number; delivered: number };
  leads: { total: number; byStatus: Record<string, number>; new: number };
  schedule: { active: number; next: string | null };
}

export interface BusinessPulse {
  tenantId: string;
  counters: PulseCounters;
  credits: {
    balance: number;
    reserved: number;
    available: number;
    quota: CreditQuota | null;
  };
  upcoming: ScheduleEntry[];
  attention: OpportunityRun[];
}

export type DroidDepartment =
  | "Product"
  | "Engineering"
  | "Design"
  | "Growth"
  | "Data"
  | "Quality"
  | "Ops"
  | "Security"
  | "Support";

export interface DroidProfile {
  id: string;
  name: string;
  role: string;
  department: DroidDepartment;
  tagline: string;
  skills: string[];
  stages: string[];
}

export interface RosterEntry extends DroidProfile {
  tasks: number;
  running: number;
  done: number;
  failed: number;
  lastTaskAt: string | null;
}

export interface CronPreview {
  cron: string;
  timezone: string;
  runs: string[];
}

// --- Substrato aziendale (P1.1): obiettivi, memoria, prodotti/servizi --------

export type GoalStatus = "active" | "achieved" | "paused" | "abandoned";

export interface Goal {
  id: string;
  tenant_id: string;
  title: string;
  description: string;
  status: GoalStatus;
  priority: number;
  metric: string;
  target_date: string | null;
  meta: unknown;
  achieved_at: string | null;
  created_at: string;
  updated_at: string;
}

export type MemoryKind = "fact" | "note" | "preference" | "constraint" | "decision" | "contact";

export interface MemoryEntry {
  id: string;
  tenant_id: string;
  kind: MemoryKind;
  title: string;
  content: string;
  source: string;
  tags: string[];
  pinned: boolean;
  meta: unknown;
  created_at: string;
  updated_at: string;
}

export type ProductKind = "product" | "service";
export type ProductStatus = "draft" | "active" | "archived";

export interface Product {
  id: string;
  tenant_id: string;
  kind: ProductKind;
  name: string;
  sku: string;
  description: string;
  price_cents: string;
  currency: string;
  status: ProductStatus;
  meta: unknown;
  created_at: string;
  updated_at: string;
}

export interface BusinessSummary {
  goals: { total: number; active: number; achieved: number; byStatus: Record<string, number> };
  memory: { total: number; pinned: number; byKind: Record<string, number> };
  products: { total: number; active: number; byStatus: Record<string, number> };
}

export interface BusinessCatalog {
  goalStatuses: { id: GoalStatus; label: string }[];
  memoryKinds: { id: MemoryKind; label: string }[];
  productKinds: { id: ProductKind; label: string }[];
  productStatuses: { id: ProductStatus; label: string }[];
}

