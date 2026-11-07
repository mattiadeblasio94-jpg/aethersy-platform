// builder/agents/planner.ts — Hierarchical Planner Agent

import type { PlannerAgent, PlannerInput, PlannerOutput, ProjectSpec, TaskNode } from "./types.js";

// System prompt for the planner
const PLANNER_SYSTEM_PROMPT = `Sei l'Architetto Planner di Aethersy Builder. Il tuo compito è trasformare un'idea imprenditoriale in una specifica tecnica completa e un grafo di task eseguibili.

OUTPUT RICHIESTO (JSON valido):
{
  "spec": { ... ProjectSpec completo ... },
  "task_graph": { "nodes": [...], "edges": [...] },
  "estimated_credits": number,
  "estimated_duration_minutes": number
}

REGOLE:
1. Analizza l'idea e identifica il tipo di progetto (saas, ecommerce, marketplace, landing, api, ecc.)
2. Definisci lo stack tecnologico ottimale (default: Next.js 15 + Fastify + Prisma + PostgreSQL + Better Auth + Tailwind + shadcn/ui)
3. Spezza in feature logiche con priorità
4. Crea task nodes per ogni agente specializzato necessario
5. Definisci dipendenze (edges) tra task
6. Stima crediti e durata per task
7. Sii concreto: niente placeholder, specifica percorsi file, comandi, schemi DB

AGENTI DISPONIBILI:
- architect: definisce architettura, schema DB, API contracts
- backend: implementa API, database, auth, business logic
- frontend: implementa UI, pagine, componenti, state management
- brand: crea logo, palette, tipografia, design system
- copy: scrive copy per landing, email, blog, ads
- growth: lead gen, outreach, ads setup, analytics
- devops: CI/CD, deploy, secrets, monitoring
- qa: test, lint, typecheck, security scan`;

async function callLLM(prompt: string, systemPrompt: string): Promise<string> {
  const { chat } = await import("../../ai-router.js");
  const result = await chat({
    capability: "text",
    prompt: `${systemPrompt}

${prompt}`,
  });
  return extractJson(result.answer);
}

/** Estrae l'oggetto JSON dalla risposta del modello (ignora fence markdown). */
function extractJson(answer: string): string {
  const fenced = answer.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : answer;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Il planner non ha restituito un JSON valido");
  }
  return raw.slice(start, end + 1);
}

/** Azioni implementate dagli agenti specializzati: il piano usa solo queste. */
const AGENT_ACTIONS: Record<string, string[]> = {
  architect: ["create_architecture", "define_db_schema", "define_api_contracts"],
  backend: ["implement_auth", "implement_api", "setup_database"],
  frontend: ["implement_auth_ui", "implement_dashboard"],
  brand: ["create_brand_kit", "create_placeholder_logo"],
  copy: ["write_copy", "write_landing_copy"],
  devops: ["setup_ci", "create_dockerfile", "create_docker_compose", "configure_env", "deploy_prepare"],
  growth: ["setup_analytics", "setup_error_tracking", "launch_checklist"],
  qa: ["run_lint", "run_typecheck", "run_tests", "run_security_scan", "run_full_qa"],
};

export const plannerAgent: PlannerAgent = {
  async plan(input: PlannerInput): Promise<PlannerOutput> {
    const prompt = `IDEA: ${input.idea}
PROJECT TYPE: ${input.project_type ?? 'auto'}
CONSTRAINTS: ${JSON.stringify(input.constraints ?? {})}
CONTEXT: ${JSON.stringify(input.context ?? {})}

Genera il piano completo in JSON. Le azioni ammesse per ogni agente sono:
${Object.entries(AGENT_ACTIONS)
  .map(([agent, actions]) => `- ${agent}: ${actions.join(", ")}`)
  .join("\n")}`;

    const response = await callLLM(prompt, PLANNER_SYSTEM_PROMPT);

    let parsed: PlannerOutput | null = null;
    try {
      parsed = JSON.parse(response) as PlannerOutput;
    } catch (err) {
      console.warn(`[planner] JSON non valido: ${(err as Error).message}`);
    }

    return sanitizePlan(parsed, input.idea);
  },
};

/**
 * Rende il piano eseguibile: scarta i nodi con agente sconosciuto, allinea le
 * azioni a quelle implementate dagli agenti, riallinea le dipendenze sui nodi
 * rimasti e ricalcola i crediti stimati.
 */
function sanitizePlan(plan: PlannerOutput | null, idea: string): PlannerOutput {
  const rawNodes = plan?.task_graph?.nodes ?? [];

  const mapped: (TaskNode | null)[] = rawNodes
    .map((node): TaskNode | null => {
      const agent = String(node.agent ?? node.type ?? "");
      const actions = AGENT_ACTIONS[agent];
      if (!actions) return null;

      const requested = String((node.spec_template ?? {}).action ?? "");
      const action = actions.includes(requested) ? requested : actions[0];
      const spec = { ...(node.spec_template ?? {}) } as Record<string, unknown>;
      spec.action = action;
      if (requested && requested !== action) spec.requested_action = requested;

      return {
        id: String(node.id ?? `task-${agent}`),
        type: String(node.type ?? agent),
        title: String(node.title ?? agent),
        description: node.description,
        agent: agent as TaskNode["agent"],
        estimated_credits: Number(node.estimated_credits ?? 10),
        estimated_duration_minutes: Number(node.estimated_duration_minutes ?? 10),
        depends_on: node.depends_on ?? [],
        spec_template: spec,
      };
    });

  const normalized = mapped.filter((node): node is TaskNode => node !== null);

  const nodes = normalized.length > 0 ? normalized : defaultNodes(idea);
  const keptIds = new Set(nodes.map((n) => n.id));

  const withDeps = nodes.map((node) => ({
    ...node,
    depends_on: (node.depends_on ?? []).filter((id) => keptIds.has(id)),
  }));

  const edges = (plan?.task_graph?.edges ?? []).filter(
    (edge) => keptIds.has(edge.from) && keptIds.has(edge.to),
  );

  return {
    spec: plan?.spec ?? defaultSpec(idea),
    task_graph: { nodes: withDeps, edges },
    estimated_credits:
      plan?.estimated_credits ?? withDeps.reduce((sum, n) => sum + n.estimated_credits, 0),
    estimated_duration_minutes:
      plan?.estimated_duration_minutes ??
      withDeps.reduce((sum, n) => sum + n.estimated_duration_minutes, 0),
  };
}

/** Catena minima eseguibile quando il modello non propone un piano utilizzabile. */
function defaultNodes(idea: string): TaskNode[] {
  return [
    {
      id: "task-brand",
      type: "brand",
      title: "Brand Identity & Design System",
      description: `Identita' visiva per: ${idea}`,
      agent: "brand",
      estimated_credits: 15,
      estimated_duration_minutes: 10,
      depends_on: [],
      spec_template: { action: "create_brand_kit", idea },
    },
    {
      id: "task-architect",
      type: "architect",
      title: "Architettura e schema dati",
      description: `Architettura tecnica per: ${idea}`,
      agent: "architect",
      estimated_credits: 20,
      estimated_duration_minutes: 15,
      depends_on: ["task-brand"],
      spec_template: { action: "create_architecture", idea },
    },
    {
      id: "task-backend",
      type: "backend",
      title: "API e business logic",
      description: `Implementazione backend per: ${idea}`,
      agent: "backend",
      estimated_credits: 25,
      estimated_duration_minutes: 20,
      depends_on: ["task-architect"],
      spec_template: { action: "implement_api", idea },
    },
    {
      id: "task-frontend",
      type: "frontend",
      title: "Dashboard e pagine UI",
      description: `Interfaccia utente per: ${idea}`,
      agent: "frontend",
      estimated_credits: 25,
      estimated_duration_minutes: 20,
      depends_on: ["task-architect"],
      spec_template: { action: "implement_dashboard", idea },
    },
    {
      id: "task-qa",
      type: "qa",
      title: "QA: lint, typecheck e test",
      description: `Controlli di qualita' su: ${idea}`,
      agent: "qa",
      estimated_credits: 10,
      estimated_duration_minutes: 10,
      depends_on: ["task-backend", "task-frontend"],
      spec_template: { action: "run_full_qa", idea },
    },
  ];
}

function defaultSpec(idea: string): ProjectSpec {
  return {
    name: idea.slice(0, 60),
    description: idea,
    type: "other",
    tech_stack: {
      frontend: "nextjs",
      backend: "fastify",
      database: "postgresql",
      orm: "prisma",
      auth: "better-auth",
      styling: "tailwind",
      ui_library: "shadcn",
      testing: "vitest",
      ci_cd: "github-actions",
    },
    features: [],
    pages: [],
    api_endpoints: [],
    auth_config: { provider: "email" },
    deploy_config: {},
  };
}
