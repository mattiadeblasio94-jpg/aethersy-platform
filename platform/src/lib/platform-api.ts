// =============================================================================
// Client tipizzato delle superfici REALI della piattaforma (BFF Console).
//
// Copre il percorso critico dell'utente: sessione, crediti, roster degli
// specialisti, opportunita' (run), agenda, chat centrale e deliverable.
// Ogni funzione mappa 1:1 una rotta di `console/server/src/{platform,business}`.
//
// Nota: gli altri endpoint (social/ads/analytics) restano per ora sul mock
// layer (`lib/api.ts`). Qui c'e' solo cio' che e' realmente servito e funziona.
// =============================================================================

import { http } from "./http";

// --- Tipi (specchio delle risposte del BFF) ---------------------------------

export interface SessionUser {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  platformRole?: string;
  verified?: boolean;
  projectId?: string | null;
}

export interface Balance {
  balance: number;
  reserved: number;
  available: number;
  quota: unknown;
}

export interface Droid {
  id: string;
  name: string;
  role: string;
  department: string;
  tagline: string;
  skills: string[];
  stages: string[];
}

export interface RosterEntry extends Droid {
  tasks: number;
  running: number;
  done: number;
  failed: number;
  lastTaskAt: string | null;
}

export interface OpportunityStateMeta {
  state: string;
  label: string;
  tone: "neutral" | "info" | "warning" | "success" | "danger";
  needsHuman: boolean;
}

export interface Opportunity {
  id: string;
  stage: string;
  title: string;
  status: string;
  approved_by: string | null;
  created_at: string;
  updated_at: string;
  opportunity: OpportunityStateMeta;
}

export interface KanbanColumn {
  bucket: string;
  label: string;
  count: number;
  runs: Opportunity[];
}

export interface KanbanBoard {
  columns: KanbanColumn[];
  total: number;
}

export interface ScheduleView {
  id: string;
  title: string;
  kind: string;
  stage: string | null;
  status: string;
  cron: string | null;
  runAt: string | null;
  timezone: string;
  nextRunAt: string | null;
}

export interface PulseCounters {
  runs: { total: number; byStatus: Record<string, number>; open: number; awaitingInput: number };
  tasks: { total: number; running: number; failed: number; pending: number };
  assets: { total: number; inReview: number; approved: number; delivered: number };
  leads: { total: number; byStatus: Record<string, number>; new: number };
  schedule: { active: number; next: string | null };
}

export interface AreaTile {
  id: string;
  title: string;
  description: string;
  icon: string;
  count: number;
  route: string;
  state: "active" | "empty" | "attention";
}

export interface BusinessPulse {
  tenantId: string;
  counters: PulseCounters;
  credits: Balance;
  upcoming: ScheduleView[];
  attention: Opportunity[];
  areaTiles: AreaTile[];
}

export interface ConversationRow {
  id: string;
  tenant_id: string;
  title: string;
  kind: "chat" | "run";
  created_at: string;
  updated_at: string;
}

export interface MessageRow {
  id: string;
  conversation_id: string;
  role: "user" | "agent" | "system";
  droid: string;
  content: string;
  credits: number;
  meta: Record<string, unknown>;
  created_at: string;
}

export interface AgentTurn {
  conversationId: string;
  reply: MessageRow;
  action: "reply" | "run_started";
  stage?: string;
  runId?: string;
  credits: number;
}

export interface PipelineTask {
  id: string;
  run_id: string;
  droid: string;
  title: string;
  status: string;
  capability: string | null;
  started_at: string | null;
  finished_at: string | null;
}

export interface PipelineAsset {
  id: string;
  run_id: string;
  task_id: string | null;
  kind: string;
  name: string;
  status: string;
  storage_key: string;
  mime: string | null;
  meta: Record<string, unknown>;
  created_at: string;
}

export interface PipelineRun {
  id: string;
  stage: string;
  title: string;
  status: string;
  approved_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface RunDetail {
  run: PipelineRun;
  tasks: PipelineTask[];
  assets: PipelineAsset[];
  usage: unknown;
}

export interface StageSpec {
  id: string;
  title: string;
  droids: string[];
}

// --- Library types ----------------------------------------------------------

export interface LibraryResource {
  id: string;
  kind: string;
  name: string;
  status: string;
  storage_key: string;
  mime: string | null;
  version: number;
  created_at: string;
  run_id: string | null;
}

export interface LibraryAgent {
  id: string;
  name: string;
  role: string;
  department: string;
  tagline: string;
  skills: string[];
  stages: string[];
  tasks: number;
  running: number;
  done: number;
  failed: number;
}

export interface LibraryMessage {
  id: string;
  conversation_id: string;
  role: string;
  droid: string;
  content: string;
  credits: number;
  created_at: string;
}

export interface LibraryInvite {
  id: string;
  email: string;
  role: string;
  status: string;
  created_at: string;
}

export interface LibraryData {
  risorse: LibraryResource[];
  agenti: LibraryAgent[];
  messaggi: LibraryMessage[];
  inviti: LibraryInvite[];
}

// --- Account types ----------------------------------------------------------

export interface AccountSummary {
  tenantId: string;
  tenantName: string;
  plan: string;
  balance: number;
  reserved: number;
  available: number;
  quota: unknown;
  markupBps: number;
  creditUnit: number;
  hardStopOnEmpty: boolean;
  billingCustomerRef: string | null;
}

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
  category: "billing" | "subscription" | "usage" | "general";
}

export interface FaqResponse {
  faqs: FaqItem[];
}

// --- API --------------------------------------------------------------------

export const platformApi = {
  // --- Sessione (auth cookie Console) --------------------------------------
  getSession: () => http.get<SessionUser>("/api/auth/session"),
  login: (email: string, password: string) =>
    http.post<SessionUser>("/api/auth/login", { email, password }),
  register: (input: { email: string; password: string; firstName?: string; lastName?: string }) =>
    http.post<{ ok: true; id: string | null; email: string }>("/api/auth/register", input),
  logout: () => http.post<{ ok: true }>("/api/auth/logout"),

  // --- Crediti --------------------------------------------------------------
  getBalance: () => http.get<Balance>("/api/ai/balance"),

  // --- Business Pulse -------------------------------------------------------
  getOverview: () => http.get<BusinessPulse>("/api/platform/overview"),

  // --- Opportunita' (run) ---------------------------------------------------
  getOpportunities: (stage?: string) =>
    http.get<Opportunity[]>("/api/platform/opportunities", stage ? { stage } : undefined),

  getKanbanBoard: (stage?: string) =>
    http.get<KanbanBoard>("/api/platform/opportunities/kanban", stage ? { stage } : undefined),

  // --- Roster ---------------------------------------------------------------
  getRoster: () => http.get<RosterEntry[]>("/api/platform/roster"),
  getDroid: (droidId: string) => http.get<RosterEntry>(`/api/platform/roster/${droidId}`),

  // --- Agenda ---------------------------------------------------------------
  getSchedule: (status?: string) =>
    http.get<ScheduleView[]>("/api/platform/schedule", status ? { status } : undefined),

  // --- Chat centrale --------------------------------------------------------
  listConversations: () =>
    http.get<{ conversations: ConversationRow[] }>("/api/platform/chat/conversations"),
  createConversation: (title?: string) =>
    http.post<ConversationRow>("/api/platform/chat/conversations", { title }),
  getConversation: (id: string) =>
    http.get<{ conversation: ConversationRow; messages: MessageRow[] }>(
      `/api/platform/chat/conversations/${id}`,
    ),
  sendMessage: (input: { text: string; conversationId?: string | null; autoStartRun?: boolean }) =>
    http.post<AgentTurn>("/api/platform/chat", input),

  // --- Pipeline (esecuzioni e deliverable) ----------------------------------
  listRuns: (query?: { stage?: string; status?: string; limit?: number }) =>
    http.get<PipelineRun[]>("/api/pipeline/runs", query),
  getRun: (runId: string) => http.get<RunDetail>(`/api/pipeline/runs/${runId}`),
  listAssets: (query?: { runId?: string; status?: string }) =>
    http.get<PipelineAsset[]>("/api/pipeline/assets", query),
  executeRun: (runId: string, body?: { continueOnError?: boolean }) =>
    http.post<unknown>(`/api/pipeline/runs/${runId}/execute`, body ?? {}),
  submitAsset: (assetId: string) => http.post<PipelineAsset>(`/api/pipeline/assets/${assetId}/submit`),
  decideAsset: (assetId: string, decision: "approved" | "rejected") =>
    http.post<PipelineAsset>(`/api/pipeline/assets/${assetId}/decide`, { decision }),

  // --- Libreria -------------------------------------------------------------
  getLibrary: () => http.get<LibraryData>("/api/platform/library"),

  // --- Account / Abbonamento ------------------------------------------------
  getAccount: () => http.get<AccountSummary>("/api/platform/account"),
  getFaq: (category?: string) =>
    http.get<FaqResponse>("/api/platform/faq", category ? { category } : undefined),
};
