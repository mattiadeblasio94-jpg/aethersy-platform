// builder/agents/runtime.ts — Agent Runtime: orchestrates planner → executor for tasks

import { taskStore } from "../tasks/store.js";
import { sandboxProvider } from "./sandbox.js";
import type { Task, TaskStep, AgentContext, AgentResult, AgentArtifact, PlannerInput, PlannerOutput } from "./types.js";
import type { PlannerAgent } from "./types.js";
import { plannerAgent } from "./planner.js";
import { architectAgent } from "./specializations/architect.js";
import { backendAgent } from "./specializations/backend.js";
import { frontendAgent } from "./specializations/frontend.js";
import { brandAgent } from "./specializations/brand.js";
import { copyAgent } from "./specializations/copy.js";
import { growthAgent } from "./specializations/growth.js";
import { devopsAgent } from "./specializations/devops.js";
import { qaAgent } from "./specializations/qa.js";

const agentExecutors: Record<string, any> = {
  planner: plannerAgent,
  architect: architectAgent,
  backend: backendAgent,
  frontend: frontendAgent,
  brand: brandAgent,
  copy: copyAgent,
  growth: growthAgent,
  devops: devopsAgent,
  qa: qaAgent,
};

export class AgentRuntime {
  async executeTask(task: Task): Promise<AgentResult> {
    const steps = await taskStore.getStepsByTask(task.id);
    
    if (steps.length === 0) {
      // No steps defined - create plan from task spec
      return this.executeWithPlanner(task);
    }

    // Execute steps sequentially
    let totalCost = 0;
    let stepsCompleted = 0;
    const allArtifacts: AgentArtifact[] = [];
    let lastOutput: Record<string, unknown> = {};

    for (const step of steps) {
      if (step.status === 'completed') {
        stepsCompleted++;
        continue;
      }

      if (step.status === 'failed') {
        throw new Error(`Step ${step.step_order} (${step.agent}) failed: ${step.error}`);
      }

      // Execute step
      const executor = agentExecutors[step.agent];
      if (!executor) {
        throw new Error(`Unknown agent: ${step.agent}`);
      }

      await taskStore.startStep(step.id);

      const context: AgentContext = {
        task,
        step,
        projectId: task.project_id,
        tenantId: task.tenant_id,
        workspacePath: `/workspace/${task.project_id}`,
      };

      try {
        const result = await executor.execute(context);
        
        await taskStore.completeStep(step.id, result.output);
        totalCost += result.costCredits;
        stepsCompleted++;
        allArtifacts.push(...result.artifacts);
        lastOutput = { ...lastOutput, ...result.output };

        // Store artifacts in DB
        for (const artifact of result.artifacts) {
          const content =
            typeof artifact.content === "string" ? artifact.content : Buffer.from(artifact.content).toString("base64");
          const isText = typeof artifact.content === "string";
          await taskStore.createArtifact({
            task_id: task.id,
            project_id: task.project_id,
            tenant_id: task.tenant_id,
            kind: artifact.kind,
            name: artifact.name,
            description: artifact.metadata?.description as string,
            uri: artifact.metadata?.uri as string ?? `sandbox://${task.project_id}/${artifact.name}`,
            metadata: {
              ...(artifact.metadata ?? {}),
              encoding: isText ? "utf-8" : "base64",
              size: content.length,
              content: content.slice(0, 65536),
              content_truncated: content.length > 65536,
            },
            version: 1,
          });
        }

      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        await taskStore.failStep(step.id, errMsg);
        throw error;
      }
    }

    return {
      output: lastOutput,
      artifacts: allArtifacts,
      costCredits: totalCost,
      stepsCompleted,
    };
  }

  private async executeWithPlanner(task: Task): Promise<AgentResult> {
    // Use planner to create execution plan
    const plannerInput: PlannerInput = {
      idea: task.spec.idea as string ?? task.description ?? task.title,
      project_type: task.spec.project_type as any,
      constraints: task.spec.constraints as Record<string, unknown>,
      context: task.spec.context as Record<string, unknown>,
    };

    const plan = await plannerAgent.plan(plannerInput);

    // Create steps from plan
    const steps: Omit<TaskStep, 'id' | 'created_at'>[] = plan.task_graph.nodes.map((node, idx) => ({
      task_id: task.id,
      agent: node.agent,
      step_order: idx,
      status: 'pending' as const,
      input: node.spec_template,
      output: undefined,
      error: undefined,
    }));

    await taskStore.createSteps(steps);

    // Now execute normally (will pick up the new steps)
    return this.executeTask(task);
  }

  // Get available agents
  getAvailableAgents(): string[] {
    return Object.keys(agentExecutors);
  }
}

export const agentRuntime = new AgentRuntime();
