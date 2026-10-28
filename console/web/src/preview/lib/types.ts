// =============================================================================
// Tipi condivisi della piattaforma Aethersy (Stadio A).
//
// Rispecchiano i contratti previsti dal brief §7. Oggi sono alimentati dal
// mock layer (src/mocks); quando i backend reali (social/agents/tasks/analytics)
// saranno disponibili, i tipi restano invariati e cambia solo l'origine dati.
// =============================================================================

export type PlatformId =
  | "instagram"
  | "linkedin"
  | "tiktok"
  | "x"
  | "facebook"
  | "youtube";

export type ConnectionStatus = "connected" | "disconnected" | "pending";

export interface PlatformStats {
  posts: number;
  followers: number;
}

export interface Platform {
  id: PlatformId;
  name: string;
  status: ConnectionStatus;
  accountName?: string;
  avatar?: string;
  stats: PlatformStats;
  /** Percorso dell'icona SVG monocromatica (brief: /icons/*.svg). */
  icon: string;
  /** Colore brand della piattaforma, usato per accenti visivi. */
  color: string;
}

export type AgentType =
  | "social"
  | "content"
  | "outreach"
  | "analytics"
  | "web"
  | "ads";

export type AgentStatus = "active" | "paused" | "error";

export interface Agent {
  id: string;
  name: string;
  type: AgentType;
  status: AgentStatus;
  description: string;
  /** ISO 8601 dell'ultimo run, oppure null se mai eseguito. */
  lastRun: string | null;
  tasksCompleted: number;
  targetPlatforms: PlatformId[];
}

export type TaskStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "scheduled";

export type TaskPriority = "low" | "medium" | "high";

export type TaskType = "post" | "content" | "analysis" | "outreach" | "ads" | "report";

export interface Task {
  id: string;
  title: string;
  agentId: string;
  agentName: string;
  platform: PlatformId;
  status: TaskStatus;
  /** ISO 8601 della creazione o dello scheduling. */
  date: string;
  priority: TaskPriority;
  /** Categoria operativa del task (Stadio B, opzionale per retro-compatibilita'). */
  type?: TaskType;
  /** Durata di esecuzione in millisecondi, se il task e' stato eseguito. */
  durationMs?: number;
}

export interface Workspace {
  id: string;
  name: string;
  /** Tipo di attivita', scelto in onboarding. */
  businessType: string;
  logo?: string;
  plan: "starter" | "pro" | "enterprise";
}

export interface DashboardStat {
  id: string;
  label: string;
  value: string;
  /** Delta vs periodo precedente, formattato (es. "+12%"). */
  delta?: string;
  trend?: "up" | "down" | "flat";
  icon: "platforms" | "agents" | "tasks" | "credits";
}

export interface AnalyticsPoint {
  /** Etichetta temporale (es. "Lun", "12 Ott"). */
  label: string;
  /** ISO 8601 del punto. */
  date: string;
  value: number;
}

export interface PlatformAnalytics {
  platform: PlatformId;
  points: AnalyticsPoint[];
  total: number;
  /** Crescita percentuale vs periodo precedente. */
  growth: number;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  image?: string;
  status: "active" | "draft" | "archived";
  stock: number;
  /** Categoria merceologica (Stadio B). */
  category?: string;
  /** Unita' vendute, usata per la classifica best-seller. */
  sold?: number;
  /** Valutazione media 0..5. */
  rating?: number;
}

export type CampaignStatus = "active" | "paused" | "completed" | "draft";
export type CampaignChannel = "meta" | "google" | "tiktok" | "linkedin" | "x";

export interface Campaign {
  id: string;
  name: string;
  channel: CampaignChannel;
  status: CampaignStatus;
  budget: number;
  spent: number;
  impressions: number;
  clicks: number;
  conversions: number;
  currency: string;
}

export interface PricingTier {
  id: "starter" | "pro" | "enterprise";
  name: string;
  monthlyPrice: number;
  annualPrice: number;
  description: string;
  highlighted: boolean;
  features: string[];
}

export interface Feature {
  id: string;
  title: string;
  description: string;
  /** Nome icona lucide-react, risolto dai componenti. */
  icon: string;
}

export interface Testimonial {
  id: string;
  name: string;
  role: string;
  company: string;
  quote: string;
  avatar?: string;
}

export interface Notification {
  id: string;
  title: string;
  description: string;
  /** ISO 8601. */
  date: string;
  read: boolean;
  kind: "info" | "success" | "warning" | "error";
}

export interface LandingContent {
  features: Feature[];
  testimonials: Testimonial[];
  pricing: PricingTier[];
  platforms: PlatformId[];
  steps: { id: string; title: string; description: string }[];
}

export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  credits: number;
  plan: Workspace["plan"];
}

// =============================================================================
// Stadio B — modelli per le pagine Social Media, Agenti (dettaglio/log),
// Outreach, Sito Web, Annunci, Prodotti e Analisi.
//
// Come per lo Stadio A restano tipi di contratto: oggi alimentati dal mock
// layer, domani dagli endpoint reali (brief §7) senza toccare i componenti.
// =============================================================================

// --- Social Media ----------------------------------------------------------

export type PostStatus = "draft" | "published" | "scheduled";
export type PostKind = "post" | "carousel" | "reel" | "story" | "video" | "article";

export interface PostEngagement {
  likes: number;
  comments: number;
  shares: number;
}

export interface Post {
  id: string;
  platform: PlatformId;
  /** Testo del contenuto (usato anche come anteprima nei caroselli). */
  text: string;
  /** Tipo di contenuto, per le statistiche di distribuzione. */
  kind: PostKind;
  status: PostStatus;
  /** ISO 8601 di pubblicazione o di programmazione. */
  date: string;
  /** Percorso immagine di anteprima (placeholder locale). */
  thumbnail?: string;
  engagement: PostEngagement;
}

export interface ScheduledPost {
  id: string;
  platform: PlatformId;
  title: string;
  /** ISO 8601 della pubblicazione programmata. */
  date: string;
}

export interface SocialSummary {
  totalFollowers: number;
  engagementRate: number;
  postsThisWeek: number;
  reach: number;
}

// --- Agenti (dettaglio e log) ----------------------------------------------

export type LogLevel = "info" | "warn" | "error";

export interface AgentLog {
  id: string;
  agentId: string;
  /** ISO 8601 dell'evento. */
  timestamp: string;
  level: LogLevel;
  message: string;
  /** Durata dell'operazione in millisecondi. */
  durationMs: number;
}

export interface AgentActivityItem {
  id: string;
  agentId: string;
  label: string;
  /** ISO 8601. */
  date: string;
  kind: "success" | "info" | "warning" | "error";
}

export interface AgentDetail {
  agent: Agent;
  tasksCompleted: number;
  /** Percentuale di successo 0..100. */
  successRate: number;
  /** Tempo medio di esecuzione in millisecondi. */
  avgDurationMs: number;
  model: string;
  config: { label: string; value: string }[];
  activity: AgentActivityItem[];
}

// --- Outreach --------------------------------------------------------------

export type OutreachStatus = "active" | "paused" | "completed" | "draft";
export type OutreachChannel = "email" | "linkedin" | "twitter" | "phone";
export type LeadStatus =
  | "new"
  | "contacted"
  | "replied"
  | "interested"
  | "meeting"
  | "won"
  | "lost";

export interface OutreachCampaign {
  id: string;
  name: string;
  channel: OutreachChannel;
  status: OutreachStatus;
  sent: number;
  replies: number;
  /** Percentuale di conversione 0..100. */
  conversionRate: number;
  /** ISO 8601 di inizio. */
  startedAt: string;
}

export interface OutreachSequenceStep {
  id: string;
  campaignId: string;
  order: number;
  channel: OutreachChannel;
  /** Giorno di invio rispetto all'inizio della sequenza. */
  dayOffset: number;
  subject: string;
  /** Tasso di apertura/risposta dello step, 0..100. */
  openRate: number;
}

export interface Lead {
  id: string;
  name: string;
  company: string;
  channel: OutreachChannel;
  status: LeadStatus;
  /** ISO 8601 dell'ultimo contatto, oppure null. */
  lastContact: string | null;
  email: string;
}

export interface OutreachSummary {
  messagesSent: number;
  responseRate: number;
  meetings: number;
  conversionRate: number;
}

// --- Sito Web --------------------------------------------------------------

export type SitePageStatus = "published" | "draft" | "review";

export interface SitePage {
  id: string;
  path: string;
  title: string;
  status: SitePageStatus;
  /** ISO 8601 dell'ultima modifica. */
  updatedAt: string;
  /** Visite nell'ultimo periodo. */
  views: number;
}

export type SeoCheckStatus = "ok" | "warning" | "error";

export interface SeoCheck {
  id: string;
  label: string;
  description: string;
  status: SeoCheckStatus;
}

export interface SeoReport {
  score: number;
  checks: SeoCheck[];
}

export interface ContactSubmission {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  /** ISO 8601 di ricezione. */
  date: string;
  read: boolean;
}

export interface SiteOverview {
  status: "published" | "draft";
  lastDeploy: string;
  domain: string;
  visitors: number;
  pageViews: number;
  bounceRate: number;
}

// --- Annunci ---------------------------------------------------------------

export type AdStatus = "active" | "paused" | "completed" | "draft";
export type AdObjective =
  | "awareness"
  | "traffic"
  | "engagement"
  | "leads"
  | "conversions";

export interface AdCreative {
  id: string;
  campaignId: string;
  name: string;
  platform: PlatformId;
  status: AdStatus;
  impressions: number;
  clicks: number;
  /** Costo per mille impressioni. */
  cpm: number;
  conversions: number;
}

export interface AdsPoint {
  label: string;
  date: string;
  spend: number;
  conversions: number;
}

export interface AdsSummary {
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  conversions: number;
  roas: number;
}

export interface AdCampaign extends Campaign {
  platform: PlatformId;
  objective: AdObjective;
}

// --- Insight ---------------------------------------------------------------

export interface AgentInsight {
  id: string;
  agentId: string;
  agentName: string;
  title: string;
  body: string;
  /** ISO 8601 di generazione. */
  date: string;
  kind: "opportunity" | "warning" | "trend";
}

// --- Filtri condivisi ------------------------------------------------------

export interface DateRange {
  /** Numero di giorni del range (7, 30, 90). */
  days: number;
  label: string;
}

// =============================================================================
// Stadio C — Impostazioni (profilo, fatturazione, integrazioni, notifiche) e
// Aiuto. Come gli stadi precedenti: tipi di contratto alimentati dal mock layer,
// senza alcun dato sensibile (nessuna carta reale, nessun token reale).
// =============================================================================

/** Preferenza di tema: scuro, chiaro o ereditato dal sistema operativo. */
export type ThemePreference = "dark" | "light" | "system";

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  /** Breve presentazione, opzionale. */
  bio: string;
  /** Codice lingua, es. "it". */
  language: string;
  /** Fuso orario IANA, es. "Europe/Rome". */
  timezone: string;
  theme: ThemePreference;
  avatar?: string;
}

export type InvoiceStatus = "paid" | "pending" | "failed";

export interface Invoice {
  id: string;
  number: string;
  /** ISO 8601 di emissione. */
  date: string;
  amount: number;
  currency: string;
  status: InvoiceStatus;
}

export interface PaymentMethod {
  id: string;
  /** Circuito, es. "Visa". */
  brand: string;
  /** Solo le ultime 4 cifre: mai il numero completo. */
  last4: string;
  /** Scadenza in formato MM/AA. */
  expiry: string;
  isDefault: boolean;
}

export interface ApiKey {
  id: string;
  name: string;
  /** Prefisso visibile della chiave, es. "ak_live_". La chiave completa non e' mai mostrata. */
  prefix: string;
  environment: "live" | "test";
  /** ISO 8601 di creazione. */
  createdAt: string;
  /** ISO 8601 dell'ultimo utilizzo, oppure null. */
  lastUsedAt: string | null;
}

export type WebhookStatus = "active" | "paused" | "error";

export interface Webhook {
  id: string;
  url: string;
  events: string[];
  status: WebhookStatus;
  /** ISO 8601 di creazione. */
  createdAt: string;
}

export interface NotificationPreferences {
  email: boolean;
  push: boolean;
  weeklyDigest: boolean;
  failedTaskAlerts: boolean;
  monthlyReport: boolean;
  productNews: boolean;
}

export type NotificationCadence = "off" | "realtime" | "daily" | "weekly";

export interface PlatformNotificationPreference {
  platform: PlatformId;
  enabled: boolean;
  cadence: NotificationCadence;
}

export type HelpCategoryId =
  | "getting-started"
  | "platforms"
  | "agents"
  | "tasks"
  | "billing"
  | "api";

export interface HelpCategory {
  id: HelpCategoryId;
  title: string;
  description: string;
  /** Nome icona lucide-react, risolto dai componenti. */
  icon: string;
  articleCount: number;
}

export interface FaqItem {
  id: string;
  category: HelpCategoryId;
  question: string;
  answer: string;
}

export type ServiceStatusKind = "operational" | "degraded" | "outage" | "maintenance";

export interface ServiceStatus {
  id: string;
  name: string;
  status: ServiceStatusKind;
  /** Uptime percentuale negli ultimi 30 giorni (0..100). */
  uptime: number;
}

export interface HelpDoc {
  id: string;
  title: string;
  description: string;
  url: string;
}
