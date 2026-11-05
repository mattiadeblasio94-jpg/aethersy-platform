// builder/types.ts — Shared types for Universal Builder Platform

export type TaskStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
export type StepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
export type ArtifactKind = 'code' | 'design' | 'document' | 'image' | 'video' | 'audio' | 'config' | 'log' | 'deploy' | 'other';
export type ProjectType = 'saas' | 'ecommerce' | 'marketplace' | 'landing' | 'mobile_app' | 'api' | 'internal_tool' | 'other';
export type CreditReason = 'task_execution' | 'agent_step' | 'sandbox_compute' | 'llm_tokens' | 'image_gen' | 'video_gen' | 'deploy' | 'stripe_recharge' | 'manual_adjustment' | 'refund';

export interface PlannerInput {
  idea: string;
  project_type?: ProjectType;
  constraints?: Record<string, unknown>;
  context?: Record<string, unknown>;
}

export interface PlannerOutput {
  spec: ProjectSpec;
  task_graph: TaskGraph;
  estimated_credits: number;
  estimated_duration_minutes: number;
}

export interface ProjectSpec {
  name: string;
  description: string;
  type: ProjectType;
  tech_stack: TechStack;
  features: Feature[];
  pages: PageSpec[];
  api_endpoints: ApiEndpoint[];
  auth_config: AuthConfig;
  deploy_config: DeployTargets;
}

export interface TechStack {
  frontend: 'nextjs' | 'react' | 'vue' | 'svelte';
  backend: 'fastify' | 'hono' | 'express' | 'nestjs';
  database: 'postgresql' | 'mysql' | 'sqlite' | 'mongodb';
  orm: 'prisma' | 'drizzle' | 'typeorm' | 'knex';
  auth: 'better-auth' | 'nextauth' | 'clerk' | 'supabase' | 'custom';
  styling: 'tailwind' | 'css-modules' | 'styled-components' | 'emotion';
  ui_library: 'shadcn' | 'radix' | 'headlessui' | 'chakra' | 'mui';
  testing: 'vitest' | 'jest' | 'playwright' | 'cypress';
  ci_cd: 'github-actions' | 'gitlab-ci' | 'vercel' | 'railway';
}

export interface Feature {
  id: string;
  name: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  dependencies?: string[];
  tasks: string[];
}

export interface PageSpec {
  route: string;
  name: string;
  description: string;
  components: string[];
  data_requirements?: string[];
}

export interface ApiEndpoint {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  description: string;
  auth_required: boolean;
  request_schema?: Record<string, unknown>;
  response_schema?: Record<string, unknown>;
}

export interface AuthConfig {
  provider: 'email' | 'oauth' | 'magic_link' | 'phone';
  oauth_providers?: ('google' | 'github' | 'microsoft' | 'discord')[];
  mfa?: boolean;
  roles?: string[];
}

export interface TaskGraph {
  nodes: TaskNode[];
  edges: TaskEdge[];
}

export interface TaskNode {
  id: string;
  type: string;
  title: string;
  description?: string;
  agent: AgentType;
  estimated_credits: number;
  estimated_duration_minutes: number;
  depends_on?: string[];
  spec_template: Record<string, unknown>;
}

export interface TaskEdge {
  from: string;
  to: string;
  condition?: string;
}

export interface Project {
  id: string;
  tenant_id: string;
  name: string;
  description?: string;
  type: ProjectType;
  spec: Record<string, unknown>;
  repo_url?: string;
  deploy_targets: DeployTargets;
  status: 'active' | 'archived' | 'deleted';
  created_at: string;
  updated_at: string;
}

export interface DeployTargets {
  vercel?: VercelDeployConfig;
  railway?: RailwayDeployConfig;
  supabase?: SupabaseDeployConfig;
  [key: string]: unknown;
}

export interface VercelDeployConfig {
  project_id?: string;
  team_id?: string;
  framework_preset?: 'nextjs' | 'vite' | 'remix' | 'astro' | 'sveltekit';
  build_command?: string;
  output_directory?: string;
  env_vars?: Record<string, string>;
  domains?: string[];
}

export interface RailwayDeployConfig {
  project_id?: string;
  environment_id?: string;
  service_name?: string;
  dockerfile_path?: string;
  env_vars?: Record<string, string>;
  domains?: string[];
}

export interface SupabaseDeployConfig {
  project_ref?: string;
  database_password?: string;
  region?: string;
  env_vars?: Record<string, string>;
}

export interface Task {
  id: string;
  project_id: string;
  tenant_id: string;
  type: string; // 'brand', 'codegen', 'marketing', 'growth', 'tech', 'deploy', 'qa'
  title: string;
  description?: string;
  status: TaskStatus;
  spec: Record<string, unknown>;
  result?: Record<string, unknown>;
  cost_credits: number;
  estimated_credits?: number;
  parent_task_id?: string;
  priority: number;
  started_at?: string;
  completed_at?: string;
  created_at: string;
  updated_at: string;
}

export interface TaskStep {
  id: string;
  task_id: string;
  agent: AgentType;
  step_order: number;
  status: StepStatus;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
  started_at?: string;
  completed_at?: string;
  created_at: string;
}

export type AgentType =
  | 'planner'
  | 'architect'
  | 'backend'
  | 'frontend'
  | 'brand'
  | 'copy'
  | 'growth'
  | 'devops'
  | 'qa';

// Nota: la precedente riga di re-export `from "./types.js"` puntava a questo
// stesso file (auto-import) e faceva fallire la build con TS1205/TS2484
// ("Re-exporting a type when 'isolatedModules' is enabled" + conflitto con la
// dichiarazione esportata). I tipi sono gia' dichiarati ed esportati qui.

export interface Artifact {
  id: string;
  task_id: string;
  project_id: string;
  tenant_id: string;
  kind: ArtifactKind;
  name: string;
  description?: string;
  uri: string;
  metadata: Record<string, unknown>;
  version: number;
  created_at: string;
}

export interface CreditLedgerEntry {
  id: string;
  tenant_id: string;
  delta: number;
  reason: CreditReason;
  task_id?: string;
  project_id?: string;
  balance_after: number;
  metadata: Record<string, unknown>;
  created_at: string;
}

// Agent specialization configs
export interface AgentSpec {
  type: AgentType;
  name: string;
  description: string;
  system_prompt: string;
  tools: string[]; // tool names the agent can use
  model?: string; // override default model
  temperature?: number;
  max_tokens?: number;
}

// Sandbox execution types
export interface SandboxExecRequest {
  command: string;
  args?: string[];
  files?: Record<string, string>; // path -> content
  env?: Record<string, string>;
  workdir?: string;
  timeout_ms?: number;
  network?: boolean;
}

export interface SandboxExecResult {
  stdout: string;
  stderr: string;
  exit_code: number;
  files?: Record<string, string>; // modified/new files
  duration_ms: number;
}

export interface SandboxContainer {
  id: string;
  status: 'creating' | 'ready' | 'busy' | 'terminated';
  created_at: string;
  last_used_at?: string;
}

// Knowledge base types
export interface KnowledgeEntry {
  id: string;
  source: 'docs' | 'github' | 'npm' | 'blog' | 'custom';
  title: string;
  content: string;
  url?: string;
  tags: string[];
  embedding?: number[];
  updated_at: string;
}

export interface RagQuery {
  query: string;
  tags?: string[];
  limit?: number;
  threshold?: number;
}

export interface RagResult {
  entries: KnowledgeEntry[];
  scores: number[];
}
