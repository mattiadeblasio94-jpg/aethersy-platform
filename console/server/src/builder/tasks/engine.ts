// builder/tasks/engine.ts — Task Engine: coordinates store, queue, and agent runtime

import { taskStore } from "./store.js";
import { taskQueue } from "./queue.js";
import { agentRuntime } from "../agents/runtime.js";
import {
  notifyTaskCreated,
  notifyTaskStarted,
  notifyTaskCompleted,
  notifyTaskFailed,
} from "../../telegram.js";
import type { Task, TaskStatus, TaskStep, AgentType, Project, Artifact } from "./types.js";

export interface EngineConfig {
  autoStart?: boolean;
  pollIntervalMs?: number;
}

export class TaskEngine {
  private config: EngineConfig;
  private running = false;
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: EngineConfig = {}) {
    this.config = {
      autoStart: config.autoStart ?? true,
      pollIntervalMs: config.pollIntervalMs ?? 2000,
    };
  }

  // Start the engine
  start(): void {
    if (this.running) return;
    this.running = true;
    this.pollTimer = setInterval(() => this.tick(), this.config.pollIntervalMs);
    console.log('[task-engine] Started');
  }

  // Stop the engine
  stop(): void {
    if (!this.running) return;
    this.running = false;
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
    console.log('[task-engine] Stopped');
  }

  // Main tick: dequeue and execute tasks
  private async tick(): Promise<void> {
    if (!this.running) return;

    const task = taskQueue.dequeue();
    if (!task) return;

    // Execute task asynchronously (don't block the tick)
    this.executeTask(task).catch(err => {
      console.error('[task-engine] Task execution error:', err);
      taskQueue.fail(task.id, String(err));
    });
  }

  // Execute a single task through the agent runtime
  private async executeTask(task: Task): Promise<void> {
    console.log(`[task-engine] Executing task ${task.id} (${task.type}: ${task.title})`);

    // Get project name for notifications
    const project = await taskStore.getProject(task.project_id);
    const projectName = project?.name;

    // Update DB: task running
    await taskStore.updateTask(task.id, { status: 'running', started_at: new Date().toISOString() });

    // Notify started
    await notifyTaskStarted({
      id: task.id,
      title: task.title,
      type: task.type,
      projectName,
    });

    try {
      // Run through agent runtime
      const result = await agentRuntime.executeTask(task);

      // Update DB: task completed
      await taskStore.completeTask(task.id, result.output, result.costCredits);

      // Record credit consumption
      if (result.costCredits > 0) {
        const balance = await taskStore.getBalance(task.tenant_id);
        await taskStore.addCreditEntry({
          tenant_id: task.tenant_id,
          delta: -result.costCredits,
          reason: 'task_execution',
          task_id: task.id,
          project_id: task.project_id,
          balance_after: balance,
          metadata: { task_type: task.type, steps: result.stepsCompleted },
        });
      }

      // Notify completed
      await notifyTaskCompleted({
        id: task.id,
        title: task.title,
        type: task.type,
        projectName,
        costCredits: result.costCredits,
        artifacts: result.artifacts?.map(a => ({ kind: a.kind, name: a.name })),
      });

      taskQueue.complete(task.id);
      console.log(`[task-engine] Task ${task.id} completed (cost: ${result.costCredits} credits)`);

    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error(`[task-engine] Task ${task.id} failed:`, errMsg);

      // Update DB: task failed
      await taskStore.failTask(task.id, errMsg);

      // Check if will retry
      const queuedTask = taskQueue.getAll().find(t => t.id === task.id);
      const willRetry = queuedTask ? queuedTask.attempts + 1 < queuedTask.max_attempts : false;

      // Notify failed
      await notifyTaskFailed({
        id: task.id,
        title: task.title,
        type: task.type,
        projectName,
        error: errMsg,
        willRetry,
      });

      // Re-queue for retry (handled by queue.fail)
      taskQueue.fail(task.id, errMsg);
    }
  }

  // Public API: create and enqueue a new task
  async createTask(taskData: Omit<Task, 'id' | 'created_at' | 'updated_at'>): Promise<Task> {
    const task = await taskStore.createTask(taskData);
    taskQueue.enqueue(task, { priority: task.priority });
    
    // Notify via Telegram
    await notifyTaskCreated({
      id: task.id,
      title: task.title,
      type: task.type,
      projectName: taskData.project_id, // Will be resolved if needed
      estimatedCredits: task.estimated_credits,
    });
    
    return task;
  }

  // Create project and initial task
  async createProjectWithTask(
    projectData: Omit<Project, 'id' | 'created_at' | 'updated_at'>,
    taskData: Omit<Task, 'id' | 'project_id' | 'tenant_id' | 'created_at' | 'updated_at'>
  ): Promise<{ project: Project; task: Task }> {
    const project = await taskStore.createProject(projectData);
    const task = await this.createTask({ ...taskData, project_id: project.id, tenant_id: project.tenant_id });
    return { project, task };
  }

  // Get task with steps and artifacts
  async getTaskDetails(taskId: string): Promise<{ task: Task | null; steps: TaskStep[]; artifacts: Artifact[] }> {
    const [task, steps, artifacts] = await Promise.all([
      taskStore.getTask(taskId),
      taskStore.getStepsByTask(taskId),
      taskStore.getArtifactsByTask(taskId),
    ]);
    return { task, steps, artifacts };
  }

  // Cancel task
  async cancelTask(taskId: string): Promise<boolean> {
    const cancelled = taskQueue.cancel(taskId);
    if (cancelled) {
      await taskStore.updateTask(taskId, { status: 'cancelled' });
    }
    return cancelled;
  }

  // Pause task
  async pauseTask(taskId: string): Promise<boolean> {
    const paused = taskQueue.pause(taskId);
    if (paused) {
      await taskStore.updateTask(taskId, { status: 'paused' });
    }
    return paused;
  }

  // Resume task
  async resumeTask(taskId: string): Promise<boolean> {
    const resumed = taskQueue.resume(taskId);
    if (resumed) {
      await taskStore.updateTask(taskId, { status: 'pending' });
    }
    return resumed;
  }

  // Get queue stats
  getQueueStats() {
    return taskQueue.getStats();
  }

  // Get all tasks for a project
  async getProjectTasks(projectId: string): Promise<Task[]> {
    return taskStore.getTasksByProject(projectId);
  }

  // Get all tasks for a tenant
  async getTenantTasks(tenantId: string, status?: TaskStatus): Promise<Task[]> {
    return taskStore.getTasksByTenant(tenantId, status);
  }
}

// Global engine instance
export const taskEngine = new TaskEngine({ autoStart: false }); // Will be started in index.ts
