// builder/routes.ts — API Routes for Universal Builder Platform

import { FastifyInstance } from "fastify";
import {
  taskStore,
  taskEngine,
  agentRuntime,
  sandboxProvider,
} from "../builder/index.js";
import type { Task, TaskStatus, Project, ArtifactKind } from "../builder/types.js";
import {
  notifyTaskCreated,
  notifyTaskStarted,
  notifyTaskCompleted,
  notifyTaskFailed,
  notifyLowBalance,
  notifyProjectDeployed,
  notifyDailySummary,
} from "../telegram.js";
import { db } from "../metering/db.js";

export async function builderRoutes(app: FastifyInstance) {
  // ============ PROJECTS ============

  // Create new project + initial task
  app.post("/api/builder/projects", async (request, reply) => {
    const { name, description, type = "saas", spec } = request.body as {
      name: string;
      description?: string;
      type?: ProjectType;
      spec?: Record<string, unknown>;
    };

    if (!name) {
      return reply.code(400).send({ error: "Nome progetto richiesto" });
    }

    // Create project
    const project = await taskStore.createProject({
      tenant_id: request.tenant.id, // Set by middleware
      name,
      description,
      type,
      spec: spec ?? {},
      deploy_targets: {
        vercel: { framework_preset: "nextjs" },
        railway: {},
        supabase: {},
      },
      status: "active",
    });

    // Create initial task: brand identity
    const task = await taskEngine.createTask({
      project_id: project.id,
      tenant_id: request.tenant.id,
      type: "brand",
      title: "Brand Identity & Design System",
      description: "Crea logo, palette colori, tipografia e system di design",
      status: "pending",
      spec: {
        idea: spec?.idea ?? name,
        project_type: type,
        constraints: spec?.constraints,
      },
      estimated_credits: 20,
    });

    await notifyTaskCreated({
      id: task.id,
      title: task.title,
      type: task.type,
      projectName: project.name,
      estimatedCredits: task.estimated_credits,
    });

    return { project, task };
  });

  // Get all projects for tenant
  app.get("/api/builder/projects", async (request, reply) => {
    const projects = await taskStore.getProjectsByTenant(request.tenant.id);
    return { projects };
  });

  // Get single project with tasks
  app.get("/api/builder/projects/:id", async (request, reply) => {
    const project = await taskStore.getProject(request.params.id);
    if (!project) return reply.code(404).send({ error: "Progetto non trovato" });

    const tasks = await taskStore.getTasksByProject(request.params.id);
    return { project, tasks };
  });

  // Update project
  app.patch("/api/builder/projects/:id", async (request, reply) => {
    const project = await taskStore.updateProject(request.params.id, request.body as Partial<Project>);
    if (!project) return reply.code(404).send({ error: "Progetto non trovato" });
    return { project };
  });

  // ============ TASKS ============

  // Get all tasks for tenant
  app.get("/api/builder/tasks", async (request, reply) => {
    const tasks = await taskStore.getTasksByTenant(request.tenant.id);
    return { tasks };
  });

  // Get single task with details
  app.get("/api/builder/tasks/:id", async (request, reply) => {
    const task = await taskStore.getTask(request.params.id);
    if (!task) return reply.code(404).send({ error: "Task non trovato" });

    const [steps, artifacts] = await Promise.all([
      taskStore.getStepsByTask(request.params.id),
      taskStore.getArtifactsByTask(request.params.id),
    ]);

    return { task, steps, artifacts };
  });

  // Create new task
  app.post("/api/builder/tasks", async (request, reply) => {
    const task = await taskEngine.createTask(request.body as Omit<Task, "id" | "created_at" | "updated_at">);
    return { task };
  });

  // Start task execution
  app.post("/api/builder/tasks/:id/start", async (request, reply) => {
    const task = await taskEngine["startTask"](request.params.id);
    // Note: the engine's internal start is driven by the tick loop
    return { message: "Task queued for execution" };
  });

  // Cancel task
  app.post("/api/builder/tasks/:id/cancel", async (request, reply) => {
    const cancelled = await taskEngine.cancelTask(request.params.id);
    if (!cancelled) return reply.code(404).send({ error: "Task non trovato o in esecuzione" });
    return { cancelled };
  });

  // Pause task
  app.post("/api/builder/tasks/:id/pause", async (request, reply) => {
    const paused = await taskEngine.pauseTask(request.params.id);
    if (!paused) return reply.code(404).send({ error: "Task non trovato" });
    return { paused };
  });

  // Resume task
  app.post("/api/builder/tasks/:id/resume", async (request, reply) => {
    const resumed = await taskEngine.resumeTask(request.params.id);
    if (!resumed) return reply.code(404).send({ error: "Task non trovato o non in pausa" });
    return { resumed };
  });

  // ============ AGENT EXECUTION ============

  // Execute agent step
  app.post("/api/builder/agents/execute", async (request, reply) => {
    const { taskId, stepId } = request.body as { taskId: string; stepId?: string };
    const task = await taskStore.getTask(taskId);
    if (!task) return reply.code(404).send({ error: "Task non trovato" });

    // If stepId specified, execute only that step
    if (stepId) {
      const step = await taskStore.getStepsByTask(taskId);
      const targetStep = step.find((s: any) => s.id === stepId);
      if (!targetStep) return reply.code(404).send({ error: "Step non trovato" });

      // Mark step as running
      await taskStore.startStep(targetStep.id);

      const result = await agentRuntime.executeTask(task); // This will process steps
      return { result, step: targetStep.id };
    }

    // Execute full task
    const result = await agentRuntime.executeTask(task);
    return { result };
  });

  // Get available agents
  app.get("/api/builder/agents/available", async (request, reply) => {
    const available = agentRuntime.getAvailableAgents();
    return { available };
  });

  // ============ LIBRARY / ARTIFACTS ============

  // Create artifact
  app.post("/api/builder/artifacts", async (request, reply) => {
    const artifact = await taskStore.createArtifact(request.body as any);
    return { artifact };
  });

  // Get artifacts by task
  app.get("/api/builder/artifacts/task/:taskId", async (request, reply) => {
    const artifacts = await taskStore.getArtifactsByTask(request.params.taskId);
    return { artifacts };
  });

  // Get artifacts by project
  app.get("/api/builder/artifacts/project/:projectId", async (request, reply) => {
    const artifacts = await taskStore.getArtifactsByProject(request.params.projectId);
    return { artifacts };
  });

  // ============ CREDITS / BILLING ============

  // Get balance
  app.get("/api/builder/credits/balance", async (request, reply) => {
    const balance = await taskStore.getBalance(request.tenant.id);
    return { balance };
  });

  // Add credit entry (for manual recharge recording)
  app.post("/api/builder/credits/entry", async (request, reply) => {
    const entry = await taskStore.addCreditEntry(request.body as any);
    return { entry };
  });

  // ============ DEPLOY ============

  // Deploy project
  app.post("/api/builder/deploy", async (request, reply) => {
    const { projectId, targets } = request.body as {
      projectId: string;
      targets?: string[]; // ['vercel', 'railway', 'supabase']
    };

    const project = await taskStore.getProject(projectId);
    if (!project) return reply.code(404).send({ error: "Progetto non trovato" });

    const deployTargets = targets ?? project.deploy_targets;

    // Create deploy task
    const task = await taskEngine.createTask({
      project_id: projectId,
      tenant_id: request.tenant.id,
      type: "deploy",
      title: `Deploy su ${targets?.join(', ') ?? 'tutti gli obiettivi'}`,
      status: "pending",
      spec: {
        idea: `Deploy project ${project.name}`,
        targets: deployTargets,
      },
      estimated_credits: 10,
    });

    await notifyProjectDeployed({
      name: project.name,
      type: project.type ?? "saas",
      urls: [], // Will be populated after actual deployment
    });

    return { task };
  });

  // ============ DAILY SUMMARY ============

  // Get daily summary for tenant
  app.get("/api/builder/summary/daily", async (request, reply) => {
    // In production, this would aggregate from the last 24h
    const tasks = await taskStore.getTenantTasks(request.tenant.id);
    const completed = tasks.filter((t: any) => t.status === "completed").length;
    const failed = tasks.filter((t: any) => t.status === "failed").length;
    const totalCredits = tasks.reduce((sum: number, t: any) => sum + (t.cost_credits ?? 0), 0);

    // Get balance
    const balance = await taskStore.getBalance(request.tenant.id);

    return {
      date: new Date().toISOString().split('T')[0],
      tasksCompleted: completed,
      tasksFailed: failed,
      totalCreditsUsed: totalCredits,
      balance,
      projectsActive: 0, // Would query active projects
    };
  });
}
