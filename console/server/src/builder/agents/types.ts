// builder/agents/types.ts — Agent runtime types

import type { Task, TaskStep, AgentType, SandboxExecRequest, SandboxExecResult, PlannerInput, PlannerOutput } from "../types.js";

// Riesporta i tipi di dominio: i moduli degli agenti li importano da "./types.js".
export type {
  Task,
  TaskStep,
  AgentType,
  SandboxExecRequest,
  SandboxExecResult,
  SandboxContainer,
  PlannerInput,
  PlannerOutput,
  ProjectSpec,
  TaskGraph,
  TaskNode,
  TaskEdge,
  TechStack,
  Feature,
  PageSpec,
  ApiEndpoint,
  AuthConfig,
} from "../types.js";

export interface AgentContext {
  task: Task;
  step: TaskStep;
  projectId: string;
  tenantId: string;
  workspacePath: string; // path in sandbox
}

export interface AgentResult {
  output: Record<string, unknown>;
  artifacts: AgentArtifact[];
  costCredits: number;
  stepsCompleted: number;
  nextStep?: Partial<TaskStep>; // for planner to continue the DAG
}

export interface AgentArtifact {
  kind: 'code' | 'design' | 'document' | 'image' | 'video' | 'audio' | 'config' | 'log' | 'deploy' | 'other';
  name: string;
  content: string | Uint8Array; // text content or binary
  metadata?: Record<string, unknown>;
}

export interface AgentExecutor {
  execute(context: AgentContext): Promise<AgentResult>;
}

export interface PlannerAgent {
  plan(input: PlannerInput): Promise<PlannerOutput>;
}

export interface SandboxProvider {
  exec(req: SandboxExecRequest): Promise<SandboxExecResult>;
  createContainer(): Promise<string>; // returns container ID
  destroyContainer(containerId: string): Promise<void>;
  ensureContainer(containerId: string): Promise<void>;
}

// Tool definitions for agents
export interface AgentTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
  execute(args: Record<string, unknown>, context: AgentContext): Promise<unknown>;
}

export interface AgentSpec {
  type: AgentType;
  name: string;
  description: string;
  systemPrompt: string;
  tools: string[]; // tool names
  model?: string;
  temperature?: number;
  maxTokens?: number;
}
