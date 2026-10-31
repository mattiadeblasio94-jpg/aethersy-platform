// builder/index.ts — Builder Module: exports all services for registration in main app

export { taskStore, taskEngine, agentRuntime, sandboxProvider } from "./tasks/index.js";
export { builderRoutes } from "./routes.ts";
export type {
  Task,
  TaskStatus,
  Project,
  TaskStep,
  Artifact,
  CreditLedgerEntry,
  TaskStatus as TaskStatusType,
  StepStatus,
  ProjectType,
  CreditReason,
  ArtifactKind,
  AgentType,
  DeployTargets,
  VercelDeployConfig,
  RailwayDeployConfig,
  SupabaseDeployConfig,
} from "../builder/types.js";
