// builder/tasks/queue.ts — Priority queue with scheduling for task execution

import type { Task, TaskStatus } from "./types.js";

export interface QueuedTask extends Task {
  queued_at: string;
  attempts: number;
  max_attempts: number;
  next_run_at?: string; // for scheduled/retried tasks
}

export class TaskQueue {
  private queue: Map<string, QueuedTask> = new Map(); // task_id -> task
  private processing: Set<string> = new Set(); // task_ids currently being processed
  private readonly maxConcurrent: number;
  private readonly retryDelaysMs: number[] = [5000, 30000, 120000, 300000]; // 5s, 30s, 2m, 5m

  constructor(maxConcurrent = 3) {
    this.maxConcurrent = maxConcurrent;
  }

  // Add task to queue (or re-queue for retry)
  enqueue(task: Task, options: { priority?: number; delayMs?: number; maxAttempts?: number } = {}): void {
    const queued: QueuedTask = {
      ...task,
      queued_at: new Date().toISOString(),
      attempts: 0,
      max_attempts: options.maxAttempts ?? 3,
      next_run_at: options.delayMs ? new Date(Date.now() + options.delayMs).toISOString() : undefined,
    };
    this.queue.set(task.id, queued);
  }

  // Get next task ready to run (respects priority, concurrency, scheduling)
  dequeue(): QueuedTask | null {
    if (this.processing.size >= this.maxConcurrent) return null;

    const now = new Date();
    let best: QueuedTask | null = null;

    for (const task of this.queue.values()) {
      // Skip if already processing
      if (this.processing.has(task.id)) continue;

      // Skip if not yet scheduled to run
      if (task.next_run_at && new Date(task.next_run_at) > now) continue;

      // Skip non-runnable statuses
      if (!['pending', 'running', 'paused'].includes(task.status)) continue;

      // Priority: higher priority first, then earlier queued
      if (!best ||
          task.priority > best.priority ||
          (task.priority === best.priority && task.queued_at < best.queued_at)) {
        best = task;
      }
    }

    if (best) {
      this.queue.delete(best.id);
      this.processing.add(best.id);
    }

    return best ?? null;
  }

  // Mark task as completed (success)
  complete(taskId: string): void {
    this.processing.delete(taskId);
  }

  // Mark task as failed, schedule retry if attempts remain
  fail(taskId: string, error: string): QueuedTask | null {
    const task = this.processing.has(taskId) ? undefined : this.queue.get(taskId);
    // If not in processing, it might have been re-queued already
    const current = task ?? [...this.queue.values()].find(t => t.id === taskId);

    if (!current) {
      this.processing.delete(taskId);
      return null;
    }

    this.processing.delete(taskId);

    if (current.attempts + 1 < current.max_attempts) {
      // Schedule retry with exponential backoff
      const delay = this.retryDelaysMs[Math.min(current.attempts, this.retryDelaysMs.length - 1)];
      current.attempts++;
      current.next_run_at = new Date(Date.now() + delay).toISOString();
      current.status = 'pending';
      this.queue.set(current.id, current);
      return current;
    } else {
      // Max attempts exceeded - task stays failed
      current.status = 'failed';
      return null;
    }
  }

  // Pause a task (re-queue with paused status)
  pause(taskId: string): boolean {
    const task = this.queue.get(taskId);
    if (task) {
      task.status = 'paused';
      return true;
    }
    if (this.processing.has(taskId)) {
      // Can't pause while processing, but caller can handle
      return false;
    }
    return false;
  }

  // Resume a paused task
  resume(taskId: string): boolean {
    const task = this.queue.get(taskId);
    if (task && task.status === 'paused') {
      task.status = 'pending';
      return true;
    }
    return false;
  }

  // Cancel a task
  cancel(taskId: string): boolean {
    if (this.queue.delete(taskId)) return true;
    if (this.processing.delete(taskId)) return true;
    return false;
  }

  // Get queue stats
  getStats(): { queued: number; processing: number; byStatus: Record<TaskStatus, number> } {
    const byStatus: Record<TaskStatus, number> = {
      pending: 0, running: 0, paused: 0, completed: 0, failed: 0, cancelled: 0
    };
    for (const task of this.queue.values()) {
      byStatus[task.status]++;
    }
    for (const id of this.processing) {
      // Processing tasks are logically "running"
      byStatus.running++;
    }
    return {
      queued: this.queue.size,
      processing: this.processing.size,
      byStatus,
    };
  }

  // Get all queued tasks (for admin/debug)
  getAll(): QueuedTask[] {
    return [...this.queue.values()].sort((a, b) => b.priority - a.priority || a.queued_at.localeCompare(b.queued_at));
  }

  // Check if task is in queue or processing
  has(taskId: string): boolean {
    return this.queue.has(taskId) || this.processing.has(taskId);
  }

  // Get task by ID (queued or processing)
  get(taskId: string): QueuedTask | null {
    return this.queue.get(taskId) ?? (this.processing.has(taskId) ? null : null);
  }
}

// Global queue instance
export const taskQueue = new TaskQueue(3); // max 3 concurrent tasks
