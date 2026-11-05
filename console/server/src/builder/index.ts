// builder/index.ts — Builder Module: exports all services for registration in main app
//
// Nota: non esiste un barrel `tasks/index.ts`: ogni servizio vive nel suo
// modulo (store / engine / runtime / sandbox) ed e' riesportato da qui. Il
// vecchio import da "./tasks/index.js" rendeva il BFF non compilabile.

export { taskStore } from "./tasks/store.js";
export { taskEngine } from "./tasks/engine.js";
export { agentRuntime } from "./agents/runtime.js";
export { sandboxProvider } from "./agents/sandbox.js";
export { builderRoutes } from "./routes.js";
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
