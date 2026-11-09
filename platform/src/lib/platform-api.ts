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

export interface LibraryAssetDetail {
  asset: {
    id: string;
    kind: string;
    name: string;
    mime: string | null;
    storageKey: string;
    status: string;
    runId: string | null;
    version: number;
    createdAt: string;
  };
  content: string | null;
  /** Asset binari (es. PDF): byte in base64. */
  contentBase64?: string | null;
  meta: Record<string, unknown>;
}

export interface LibraryResource {
  id: string;
  kind: string;
  name: string;
  status: string;
  storage_key: string;
  mime: string | null;
  size_bytes: string | null;
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

// --- Business (obiettivi, memoria, catalogo) --------------------------------

export interface Goal {
  id: string;
  tenant_id: string;
  title: string;
  description: string;
  status: string;
  priority: number;
  metric: string;
  target_date: string | null;
  meta: unknown;
  achieved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MemoryEntry {
  id: string;
  tenant_id: string;
  kind: string;
  title: string;
  content: string;
  source: string;
  tags: string[];
  pinned: boolean;
  meta: unknown;
  created_at: string;
  updated_at: string;
}

export interface BusinessCatalog {
  goalStatuses: { id: string; label: string }[];
  memoryKinds: { id: string; label: string }[];
  productKinds: { id: string; label: string }[];
  productStatuses: { id: string; label: string }[];
}

// --- Consumo (crediti) -------------------------------------------------------

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
}

export interface UsageResponse {
  metering: boolean;
  events: UsageEvent[];
}

// --- API --------------------------------------------------------------------

export interface SocialProviderStatus {
  id: "google" | "github" | "telegram";
  label: string;
  /** true se il provider e' configurato lato server (client_id/secret). */
  configured: boolean;
  scopes: string[];
  redirectUri: string;
  /** Ultimo errore osservato nel flusso: viene mostrato sulla pagina di login. */
  lastError: { code: string; message: string; at: string } | null;
}

export const platformApi = {
  // --- Sessione (auth cookie Console) --------------------------------------
  getSession: () => http.get<SessionUser>("/api/auth/session"),
  /** Stato dei provider di login sociale (Google, GitHub, Telegram). */
  getSocialProviders: () =>
    http.get<{ providers: Record<string, SocialProviderStatus> }>("/api/auth/social/providers"),
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
  updateSchedule: (
    id: string,
    body: { status?: string; title?: string; cron?: string | null; runAt?: string | null },
  ) => http.patch<ScheduleView>(`/api/platform/schedule/${encodeURIComponent(id)}`, body),
  deleteSchedule: (id: string) =>
    http.delete<{ ok: boolean }>(`/api/platform/schedule/${encodeURIComponent(id)}`),

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
  getLibraryAsset: (id: string) =>
    http.get<LibraryAssetDetail>(`/api/platform/library/${encodeURIComponent(id)}`),

  // --- Account / Abbonamento ------------------------------------------------
  getAccount: () => http.get<AccountSummary>("/api/platform/account"),
  getFaq: (category?: string) =>
    http.get<FaqResponse>("/api/platform/faq", category ? { category } : undefined),

  // --- Obiettivi (business.goal) --------------------------------------------
  getGoals: (status?: string) =>
    http.get<Goal[]>("/api/platform/goals", status ? { status } : undefined),
  createGoal: (body: {
    title: string;
    description?: string;
    status?: string;
    priority?: number;
    metric?: string;
    targetDate?: string | null;
  }) => http.post<Goal>("/api/platform/goals", body),
  updateGoal: (
    id: string,
    body: {
      title?: string;
      description?: string;
      status?: string;
      priority?: number;
      metric?: string;
      targetDate?: string | null;
    },
  ) => http.patch<Goal>(`/api/platform/goals/${encodeURIComponent(id)}`, body),
  deleteGoal: (id: string) =>
    http.delete<{ ok: boolean }>(`/api/platform/goals/${encodeURIComponent(id)}`),

  // --- Memoria (business.memory) --------------------------------------------
  getMemory: (query?: { kind?: string; search?: string; pinned?: string; limit?: string }) =>
    http.get<MemoryEntry[]>("/api/platform/memory", query),
  createMemory: (body: {
    kind: string;
    title: string;
    content?: string;
    source?: string;
    tags?: string[];
    pinned?: boolean;
  }) => http.post<MemoryEntry>("/api/platform/memory", body),
  updateMemory: (
    id: string,
    body: {
      kind?: string;
      title?: string;
      content?: string;
      source?: string;
      tags?: string[];
      pinned?: boolean;
    },
  ) => http.patch<MemoryEntry>(`/api/platform/memory/${encodeURIComponent(id)}`, body),
  deleteMemory: (id: string) =>
    http.delete<{ ok: boolean }>(`/api/platform/memory/${encodeURIComponent(id)}`),
  getBusinessCatalog: () => http.get<BusinessCatalog>("/api/platform/business/catalog"),

  // --- Consumo --------------------------------------------------------------
  getUsage: (limit = 50) => http.get<UsageResponse>(`/api/ai/usage?limit=${limit}`),

  // --- Piattaforme / connessioni social -------------------------------------
  getPlatforms: () => http.get<PlatformConnection[]>("/api/platform/platforms"),
  connectPlatform: (id: string) =>
    http.post<{ ok: boolean; mode: string; id: string; label: string; redirect: string }>(
      `/api/platform/platforms/${encodeURIComponent(id)}/connect`,
      {},
    ),
  disconnectPlatform: (id: string) =>
    http.delete<{ ok: boolean }>(`/api/platform/platforms/${encodeURIComponent(id)}`),

  // --- Connettori (login reale ai provider) ---------------------------------
  getConnectors: () => http.get<ConnectorCatalog>("/api/pipeline/connectors"),
  /** URL del flusso di login al provider (redirect del browser, non fetch). */
  connectorConnectUrl: (id: string) =>
    `/api/pipeline/connectors/${encodeURIComponent(id)}/connect`,
  saveConnectorApiKey: (id: string, fields: Record<string, string>) =>
    http.post<{ ok: boolean; connector: string; connected: boolean }>(
      `/api/pipeline/connectors/${encodeURIComponent(id)}/api-key`,
      { fields },
    ),
  testConnector: (id: string) =>
    http.post<ConnectorTestResult>(`/api/pipeline/connectors/${encodeURIComponent(id)}/test`, {}),
  disconnectConnector: (id: string) =>
    http.post<{ ok: boolean; connector: string; connected: boolean }>(
      `/api/pipeline/connectors/${encodeURIComponent(id)}/disconnect`,
      {},
    ),
  /** Registra l'app OAuth del provider (client_id + client_secret). */
  registerConnectorApp: (id: string, body: { clientId: string; clientSecret: string; redirectUri?: string }) =>
    http.post<{ ok: boolean; connector: string; appRegistered: boolean; redirectUri: string; message: string }>(
      `/api/pipeline/connectors/${encodeURIComponent(id)}/app`,
      body,
    ),
  /** Rimuove l'app OAuth registrata dal tenant. */
  deleteConnectorApp: (id: string) =>
    http.delete<{ ok: boolean; connector: string; appRegistered: boolean }>(
      `/api/pipeline/connectors/${encodeURIComponent(id)}/app`,
    ),

  // --- Post social ----------------------------------------------------------
  getSocialPosts: () => http.get<SocialPost[]>("/api/platform/social/posts"),
  getSocialScheduledPosts: () =>
    http.get<SocialScheduledPost[]>("/api/platform/social/scheduled"),
  getSocialSummary: () => http.get<SocialSummaryResponse>("/api/platform/social/summary"),

  // --- Task -----------------------------------------------------------------
  getTasks: () => http.get<PlatformTask[]>("/api/platform/tasks"),

  // --- Profilo e preferenze (dati reali, schema `auth`) ----------------------
  getProfile: () => http.get<{ profile: IdentityProfile }>("/api/platform/profile"),
  updateProfile: (body: Partial<Omit<IdentityProfile, "email">>) =>
    http.patch<{ profile: IdentityProfile }>("/api/platform/profile", body),
  getPreferences: () => http.get<{ preferences: IdentityPreferences }>("/api/platform/preferences"),
  updatePreferences: (body: Partial<Omit<IdentityPreferences, "email" | "updatedAt">>) =>
    http.patch<{ preferences: IdentityPreferences }>("/api/platform/preferences", body),

  // --- Catalogo prodotti (business.product) ---------------------------------
  getProducts: () => http.get<ProductItem[]>("/api/platform/products"),
  createProduct: (body: { name: string; kind?: string; description?: string; priceCents?: number; sku?: string }) =>
    http.post<ProductItem>("/api/platform/products", body),
  updateProduct: (
    id: string,
    body: { name?: string; kind?: string; description?: string; priceCents?: number; status?: string },
  ) => http.patch<ProductItem>(`/api/platform/products/${encodeURIComponent(id)}`, body),
  deleteProduct: (id: string) => http.delete<{ ok: boolean }>(`/api/platform/products/${encodeURIComponent(id)}`),

  // --- Lead (pipeline) -------------------------------------------------------
  getLeads: () => http.get<{ leads: LeadItem[]; counts: Record<string, number> }>("/api/pipeline/leads"),
  createLead: (body: { email: string; name?: string; source?: string; message?: string }) =>
    http.post<LeadItem>("/api/pipeline/leads", body),
  updateLead: (id: string, body: { status?: string; note?: string }) =>
    http.patch<LeadItem>(`/api/pipeline/leads/${encodeURIComponent(id)}`, body),

  // --- Notifiche in-app ------------------------------------------------------
  getNotifications: () =>
    http.get<{ notifications: NotificationItem[]; unread: number }>("/api/platform/notifications"),
  markNotificationRead: (id: string) =>
    http.post<{ ok: boolean }>(`/api/platform/notifications/${encodeURIComponent(id)}/read`, {}),
  markAllNotificationsRead: () =>
    http.post<{ ok: boolean; updated: number }>("/api/platform/notifications/read-all", {}),

  // --- Integrazioni (canali configurati sul tenant) -------------------------
  getIntegrations: () => http.get<IntegrationItem[]>("/api/pipeline/integrations"),
  saveIntegration: (body: {
    provider: string;
    kind?: "oauth" | "webhook" | "api_key";
    label?: string;
    secret?: string;
    scopes?: string[];
  }) => http.post<IntegrationItem>("/api/pipeline/integrations", body),
  testIntegration: (id: string, message?: string) =>
    http.post<{ ok: boolean; provider: string; status: number }>(
      `/api/pipeline/integrations/${encodeURIComponent(id)}/test`,
      message ? { message } : {},
    ),
  revokeIntegration: (id: string) =>
    http.post<{ ok: boolean }>(`/api/pipeline/integrations/${encodeURIComponent(id)}/revoke`, {}),
  saveWebhook: (body: { url: string; signingSecret?: string; label?: string }) =>
    http.post<IntegrationItem>("/api/pipeline/webhooks", body),
  getWebhookDeliveries: () =>
    http.get<{ deliveries: WebhookDelivery[] }>("/api/platform/webhook-deliveries"),

  // --- Agenti specialistici e task (Universal Builder Platform) --------------
  getBuilderAgents: () => http.get<{ available: string[] }>("/api/builder/agents/available"),
  getBuilderTasks: () => http.get<{ tasks: BuilderTask[] }>("/api/builder/tasks"),
  getBuilderArtifacts: () => http.get<{ artifacts: BuilderArtifact[] }>("/api/builder/artifacts"),
  getBuilderTask: (id: string) =>
    http.get<{ task: BuilderTask; steps: BuilderStep[]; artifacts: BuilderArtifact[] }>(
      `/api/builder/tasks/${encodeURIComponent(id)}`,
    ),
  createBuilderTask: (body: {
    project_id: string;
    tenant_id?: string;
    type: string;
    title: string;
    description?: string;
    spec?: Record<string, unknown>;
    priority?: number;
    estimated_credits?: number;
  }) => http.post<{ task: BuilderTask }>("/api/builder/tasks", body),
  createBuilderProject: (body: { name: string; description?: string; type?: string; spec?: Record<string, unknown> }) =>
    http.post<{ project: BuilderProject }>("/api/builder/projects", body),
  getBuilderProjects: () => http.get<{ projects: BuilderProject[] }>("/api/builder/projects"),
  deleteBuilderProject: (id: string) =>
    http.delete<{ ok: boolean }>(`/api/builder/projects/${encodeURIComponent(id)}`),
  deleteBuilderTask: (id: string) =>
    http.delete<{ ok: boolean }>(`/api/builder/tasks/${encodeURIComponent(id)}`),

  // --- Agenti attiva/pausa --------------------------------------------------
  activateAgent: (id: string) =>
    http.post<{ ok: boolean }>(`/api/platform/agents/${encodeURIComponent(id)}/activate`, {}),
  pauseAgent: (id: string) =>
    http.post<{ ok: boolean }>(`/api/platform/agents/${encodeURIComponent(id)}/pause`, {}),

};

// --- Tipi risposte BFF (Stadio A) ------------------------------------------

export interface PlatformConnection {
  id: string;
  provider: string;
  kind: string;
  label: string;
  status: string;
  connected: boolean;
}

// --- Connettori --------------------------------------------------------------

export type ConnectorAuth = "google" | "github" | "provider" | "api_key";

export interface ConnectorEntry {
  id: string;
  label: string;
  category: string;
  categoryLabel: string;
  auth: ConnectorAuth;
  loginLabel: string;
  scopes: string[];
  capabilities: string[];
  howTo: string;
  configured: boolean;
  missingReason: string | null;
  apiKeyFields: { key: string; label: string; secret?: boolean }[];
  connected: boolean;
  connectedAt: string | null;
  revoked: boolean;
  testable: boolean;
  redirectUri: string;
  /** Console sviluppatore dove si registra l'app OAuth del provider. */
  signupUrl: string | null;
  /** Il tenant ha registrato una app OAuth per questo provider. */
  appRegistered: boolean;
  /** Un solo accesso attiva piu' servizi (Google). */
  master: boolean;
  masterServices: string[];
  /** Avviso sui requisiti del provider (Google: utente di test). */
  notice: string | null;
  /** Console del provider (schermata di consenso OAuth). */
  consoleUrl: string | null;
  /** Come si attiva il collegamento per tutti gli utenti della piattaforma. */
  distribution: {
    mode: "platform" | "self_serve" | "review" | "byo";
    requirement: string;
    /** L'app OAuth e' della piattaforma: l'utente non registra nulla. */
    platformApp: boolean;
  };
}

export interface ConnectorCatalog {
  connectors: ConnectorEntry[];
  groups: { key: string; label: string; count: number }[];
  summary: { total: number; connected: number; ready: number; apps: number };
}

export interface ConnectorTestResult {
  ok: boolean;
  status: number;
  detail: string;
  connector: string;
}

export interface SocialPost {
  id: string;
  kind: string;
  name: string;
  status: string;
  storageKey: string;
  mime: string | null;
  createdAt: string;
  meta: Record<string, unknown>;
}

export interface SocialScheduledPost {
  id: string;
  title: string;
  kind: string;
  stage: string | null;
  cron: string | null;
  runAt: string | null;
  timezone: string;
  status: string;
  nextRunAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SocialSummaryResponse {
  totalPosts: number;
  postsByStatus: Record<string, number>;
  totalScheduled: number;
  scheduledByStatus: Record<string, number>;
  lastPostAt: string | null;
}

export interface PlatformTask {
  id: string;
  runId: string;
  runTitle: string;
  runStage: string;
  runStatus: string;
  seq: number;
  droid: string;
  title: string;
  status: string;
  startedAt: string | null;
  finishedAt: string | null;
}

// --- Tipi: profilo, preferenze, catalogo, lead, integrazioni, builder ------

export interface IdentityProfile {
  email: string;
  firstName: string;
  lastName: string;
  company: string;
  roleTitle: string;
  timezone: string;
  locale: string;
}

export interface IdentityPreferences {
  emailDigest: "off" | "daily" | "weekly";
  runUpdates: boolean;
  leadAlerts: boolean;
  budgetAlerts: boolean;
  channelEmail: boolean;
  channelPush: boolean;
  quietHours: boolean;
  updatedAt: string | null;
}

export interface ProductItem {
  id: string;
  kind: string;
  name: string;
  sku: string;
  description: string;
  priceCents: number;
  currency: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface LeadItem {
  id: string;
  email: string;
  name: string | null;
  source: string | null;
  message: string | null;
  status: string;
  meta: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookDelivery {
  id: string;
  event: string;
  signature: string | null;
  payload: Record<string, unknown>;
  receivedAt: string;
}

export interface NotificationItem {
  id: string;
  scope: "tenant" | "platform";
  kind: string;
  severity: "info" | "success" | "warning" | "critical";
  title: string;
  body: string;
  link: string | null;
  meta: Record<string, unknown>;
  read: boolean;
  readAt: string | null;
  createdAt: string;
}

export interface IntegrationItem {
  id: string;
  provider: string;
  kind: string;
  label: string;
  scopes: string[];
  status: string;
  meta: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface BuilderProject {
  id: string;
  name: string;
  description: string | null;
  type: string;
  status: string;
  createdAt: string;
}

export interface BuilderTask {
  id: string;
  project_id: string;
  tenant_id: string;
  type: string;
  title: string;
  description?: string;
  status: string;
  spec: Record<string, unknown>;
  result?: Record<string, unknown>;
  cost_credits: number;
  estimated_credits?: number;
  priority: number;
  started_at?: string;
  completed_at?: string;
  created_at: string;
  updated_at: string;
}

export interface BuilderStep {
  id: string;
  task_id: string;
  agent: string;
  step_order: number;
  status: string;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
  started_at?: string;
  completed_at?: string;
}

export interface BuilderArtifact {
  id: string;
  task_id: string;
  project_id: string;
  tenant_id: string;
  kind: string;
  name: string;
  description?: string;
  uri: string;
  metadata: Record<string, unknown>;
  version: number;
  created_at: string;
}
