// builder/tasks/store.ts — Persistence layer for tasks, steps, artifacts, projects, credits

import { db } from "../../metering/db.js";

// --- normalizzazione righe Postgres -------------------------------------------

function str(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

function strOpt(value: unknown): string | undefined {
  return value === null || value === undefined ? undefined : String(value);
}

function num(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function obj(value: unknown): Record<string, unknown> {
  return (value ?? {}) as Record<string, unknown>;
}

function objOpt(value: unknown): Record<string, unknown> | undefined {
  return value === null || value === undefined ? undefined : (value as Record<string, unknown>);
}

import type {
  Project,
  Task,
  TaskStep,
  Artifact,
  CreditLedgerEntry,
  TaskStatus,
  StepStatus,
  ProjectType,
  CreditReason,
  ArtifactKind,
  AgentType,
} from "./types.js";

export class TaskStore {
  // ========== PROJECTS ==========
  async createProject(p: Omit<Project, 'id' | 'created_at' | 'updated_at'>): Promise<Project> {
    const res = await db().query(
      `INSERT INTO builder.project (tenant_id, name, description, type, spec, repo_url, deploy_targets, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [p.tenant_id, p.name, p.description ?? null, p.type, JSON.stringify(p.spec), p.repo_url ?? null, JSON.stringify(p.deploy_targets), p.status]
    );
    return this.mapProject(res.rows[0]);
  }

  async getProject(id: string): Promise<Project | null> {
    const res = await db().query(`SELECT * FROM builder.project WHERE id = $1`, [id]);
    return res.rows[0] ? this.mapProject(res.rows[0]) : null;
  }

  async getProjectsByTenant(tenantId: string, status?: string): Promise<Project[]> {
    const params: unknown[] = [tenantId];
    let sql = `SELECT * FROM builder.project WHERE tenant_id = $1`;
    if (status) {
      sql += ` AND status = $2`;
      params.push(status);
    }
    sql += ` ORDER BY created_at DESC`;
    const res = await db().query(sql, params);
    return res.rows.map(this.mapProject);
  }

  async updateProject(id: string, updates: Partial<Pick<Project, 'name' | 'description' | 'spec' | 'repo_url' | 'deploy_targets' | 'status'>>): Promise<Project | null> {
    const fields: string[] = [];
    const params: unknown[] = [id];
    let idx = 2;
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        fields.push(`${key} = $${idx++}`);
        params.push(key === 'spec' || key === 'deploy_targets' ? JSON.stringify(value) : value);
      }
    }
    if (fields.length === 0) return this.getProject(id);
    fields.push(`updated_at = now()`);
    const res = await db().query(
      `UPDATE builder.project SET ${fields.join(', ')} WHERE id = $1 RETURNING *`,
      params
    );
    return res.rows[0] ? this.mapProject(res.rows[0]) : null;
  }

  // ========== TASKS ==========
  async createTask(t: Omit<Task, 'id' | 'created_at' | 'updated_at'>): Promise<Task> {
    const res = await db().query(
      `INSERT INTO builder.task (project_id, tenant_id, type, title, description, status, spec, result, cost_credits, estimated_credits, parent_task_id, priority)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [t.project_id, t.tenant_id, t.type, t.title, t.description ?? null, t.status, JSON.stringify(t.spec), t.result ? JSON.stringify(t.result) : null, t.cost_credits, t.estimated_credits ?? null, t.parent_task_id ?? null, t.priority]
    );
    return this.mapTask(res.rows[0]);
  }

  async getTask(id: string): Promise<Task | null> {
    const res = await db().query(`SELECT * FROM builder.task WHERE id = $1`, [id]);
    return res.rows[0] ? this.mapTask(res.rows[0]) : null;
  }

  async getTasksByProject(projectId: string): Promise<Task[]> {
    const res = await db().query(`SELECT * FROM builder.task WHERE project_id = $1 ORDER BY priority DESC, created_at ASC`, [projectId]);
    return res.rows.map(this.mapTask);
  }

  async getTasksByTenant(tenantId: string, status?: TaskStatus): Promise<Task[]> {
    const params: unknown[] = [tenantId];
    let sql = `SELECT * FROM builder.task WHERE tenant_id = $1`;
    if (status) {
      sql += ` AND status = $2`;
      params.push(status);
    }
    sql += ` ORDER BY priority DESC, created_at ASC`;
    const res = await db().query(sql, params);
    return res.rows.map(this.mapTask);
  }

  async updateTask(id: string, updates: Partial<Pick<Task, 'status' | 'spec' | 'result' | 'cost_credits' | 'started_at' | 'completed_at' | 'priority'>>): Promise<Task | null> {
    const fields: string[] = [];
    const params: unknown[] = [id];
    let idx = 2;
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        fields.push(`${key} = $${idx++}`);
        params.push(key === 'spec' || key === 'result' ? JSON.stringify(value) : value);
      }
    }
    if (fields.length === 0) return this.getTask(id);
    fields.push(`updated_at = now()`);
    const res = await db().query(
      `UPDATE builder.task SET ${fields.join(', ')} WHERE id = $1 RETURNING *`,
      params
    );
    return res.rows[0] ? this.mapTask(res.rows[0]) : null;
  }

  async startTask(id: string): Promise<Task | null> {
    return this.updateTask(id, { status: 'running', started_at: new Date().toISOString() });
  }

  async completeTask(id: string, result: Record<string, unknown>, costCredits: number): Promise<Task | null> {
    return this.updateTask(id, { status: 'completed', result, cost_credits: costCredits, completed_at: new Date().toISOString() });
  }

  async failTask(id: string, error: string): Promise<Task | null> {
    return this.updateTask(id, { status: 'failed', result: { error }, completed_at: new Date().toISOString() });
  }

  // ========== TASK STEPS ==========
  async createSteps(steps: Omit<TaskStep, 'id' | 'created_at'>[]): Promise<TaskStep[]> {
    if (steps.length === 0) return [];
    const values: string[] = [];
    const params: unknown[] = [];
    for (const step of steps) {
      const idx = params.length + 1;
      values.push(`($${idx}, $${idx+1}, $${idx+2}, $${idx+3}, $${idx+4}, $${idx+5}, $${idx+6})`);
      params.push(step.task_id, step.agent, step.step_order, step.status, JSON.stringify(step.input), step.output ? JSON.stringify(step.output) : null, step.error ?? null);
    }
    const res = await db().query(
      `INSERT INTO builder.task_step (task_id, agent, step_order, status, input, output, error)
       VALUES ${values.join(', ')}
       RETURNING *`,
      params
    );
    return res.rows.map(this.mapStep);
  }

  async getStepsByTask(taskId: string): Promise<TaskStep[]> {
    const res = await db().query(`SELECT * FROM builder.task_step WHERE task_id = $1 ORDER BY step_order`, [taskId]);
    return res.rows.map(this.mapStep);
  }

  async updateStep(id: string, updates: Partial<Pick<TaskStep, 'status' | 'input' | 'output' | 'error' | 'started_at' | 'completed_at'>>): Promise<TaskStep | null> {
    const fields: string[] = [];
    const params: unknown[] = [id];
    let idx = 2;
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        fields.push(`${key} = $${idx++}`);
        params.push(key === 'input' || key === 'output' ? JSON.stringify(value) : value);
      }
    }
    if (fields.length === 0) {
      const res = await db().query(`SELECT * FROM builder.task_step WHERE id = $1`, [id]);
      return res.rows[0] ? this.mapStep(res.rows[0]) : null;
    }
    const res = await db().query(
      `UPDATE builder.task_step SET ${fields.join(', ')} WHERE id = $1 RETURNING *`,
      params
    );
    return res.rows[0] ? this.mapStep(res.rows[0]) : null;
  }

  async startStep(id: string): Promise<TaskStep | null> {
    return this.updateStep(id, { status: 'running', started_at: new Date().toISOString() });
  }

  async completeStep(id: string, output: Record<string, unknown>): Promise<TaskStep | null> {
    return this.updateStep(id, { status: 'completed', output, completed_at: new Date().toISOString() });
  }

  async failStep(id: string, error: string): Promise<TaskStep | null> {
    return this.updateStep(id, { status: 'failed', error, completed_at: new Date().toISOString() });
  }

  // ========== ARTIFACTS ==========
  async createArtifact(a: Omit<Artifact, 'id' | 'created_at'>): Promise<Artifact> {
    const res = await db().query(
      `INSERT INTO builder.artifact (task_id, project_id, tenant_id, kind, name, description, uri, metadata, version)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [a.task_id, a.project_id, a.tenant_id, a.kind, a.name, a.description ?? null, a.uri, JSON.stringify(a.metadata), a.version]
    );
    return this.mapArtifact(res.rows[0]);
  }

  async getArtifactsByTask(taskId: string): Promise<Artifact[]> {
    const res = await db().query(`SELECT * FROM builder.artifact WHERE task_id = $1 ORDER BY created_at DESC`, [taskId]);
    return res.rows.map(this.mapArtifact);
  }

  async getArtifactsByProject(projectId: string): Promise<Artifact[]> {
    const res = await db().query(`SELECT * FROM builder.artifact WHERE project_id = $1 ORDER BY kind, created_at DESC`, [projectId]);
    return res.rows.map(this.mapArtifact);
  }

  async getArtifactsByTenant(tenantId: string, kind?: ArtifactKind): Promise<Artifact[]> {
    const params: unknown[] = [tenantId];
    let sql = `SELECT * FROM builder.artifact WHERE tenant_id = $1`;
    if (kind) {
      sql += ` AND kind = $2`;
      params.push(kind);
    }
    sql += ` ORDER BY created_at DESC`;
    const res = await db().query(sql, params);
    return res.rows.map(this.mapArtifact);
  }

  // ========== CREDIT LEDGER ==========
  async addCreditEntry(entry: Omit<CreditLedgerEntry, 'id' | 'created_at'>): Promise<CreditLedgerEntry> {
    const res = await db().query(
      `INSERT INTO builder.credit_ledger (tenant_id, delta, reason, task_id, project_id, balance_after, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [entry.tenant_id, entry.delta, entry.reason, entry.task_id ?? null, entry.project_id ?? null, entry.balance_after, JSON.stringify(entry.metadata)]
    );
    return this.mapCreditEntry(res.rows[0]);
  }

  async getBalance(tenantId: string): Promise<number> {
    const res = await db().query(
      `SELECT COALESCE(SUM(delta), 0) as balance FROM builder.credit_ledger WHERE tenant_id = $1`,
      [tenantId]
    );
    return Number(res.rows[0]?.balance ?? 0);
  }

  async getCreditHistory(tenantId: string, limit = 50): Promise<CreditLedgerEntry[]> {
    const res = await db().query(
      `SELECT * FROM builder.credit_ledger WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [tenantId, limit]
    );
    return res.rows.map(this.mapCreditEntry);
  }

  // ========== MAPPERS ==========
  // Le righe Postgres tornano come `unknown`: i mapper normalizzano i valori
  // una sola volta, qui, invece di disperdere cast nei consumer.

  private mapProject(row: Record<string, unknown>): Project {
    return {
      id: str(row.id),
      tenant_id: str(row.tenant_id),
      name: str(row.name),
      description: strOpt(row.description),
      type: (row.type as ProjectType) ?? "other",
      spec: obj(row.spec),
      repo_url: strOpt(row.repo_url),
      deploy_targets: obj(row.deploy_targets),
      status: (str(row.status) || "active") as Project["status"],
      created_at: str(row.created_at),
      updated_at: str(row.updated_at),
    };
  }

  private mapTask(row: Record<string, unknown>): Task {
    return {
      id: str(row.id),
      project_id: str(row.project_id),
      tenant_id: str(row.tenant_id),
      type: str(row.type),
      title: str(row.title),
      description: strOpt(row.description),
      status: (str(row.status) || "pending") as TaskStatus,
      spec: obj(row.spec),
      result: objOpt(row.result),
      cost_credits: num(row.cost_credits),
      estimated_credits: row.estimated_credits === null || row.estimated_credits === undefined
        ? undefined
        : num(row.estimated_credits),
      parent_task_id: strOpt(row.parent_task_id),
      priority: num(row.priority),
      started_at: strOpt(row.started_at),
      completed_at: strOpt(row.completed_at),
      created_at: str(row.created_at),
      updated_at: str(row.updated_at),
    };
  }

  private mapStep(row: Record<string, unknown>): TaskStep {
    return {
      id: str(row.id),
      task_id: str(row.task_id),
      agent: str(row.agent) as AgentType,
      step_order: num(row.step_order),
      status: (str(row.status) || "pending") as StepStatus,
      input: obj(row.input),
      output: objOpt(row.output),
      error: strOpt(row.error),
      started_at: strOpt(row.started_at),
      completed_at: strOpt(row.completed_at),
      created_at: str(row.created_at),
    };
  }

  private mapArtifact(row: Record<string, unknown>): Artifact {
    return {
      id: str(row.id),
      task_id: str(row.task_id),
      project_id: str(row.project_id),
      tenant_id: str(row.tenant_id),
      kind: str(row.kind) as ArtifactKind,
      name: str(row.name),
      description: strOpt(row.description),
      uri: str(row.uri),
      metadata: obj(row.metadata),
      version: num(row.version),
      created_at: str(row.created_at),
    };
  }

  private mapCreditEntry(row: Record<string, unknown>): CreditLedgerEntry {
    return {
      id: str(row.id),
      tenant_id: str(row.tenant_id),
      delta: num(row.delta),
      reason: str(row.reason) as CreditReason,
      task_id: strOpt(row.task_id),
      project_id: strOpt(row.project_id),
      balance_after: num(row.balance_after),
      metadata: obj(row.metadata),
      created_at: str(row.created_at),
    };
  }
}

export const taskStore = new TaskStore();
