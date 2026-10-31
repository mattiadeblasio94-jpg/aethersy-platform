// builder/agents/planner.ts — Hierarchical Planner Agent

import type { PlannerAgent, PlannerInput, PlannerOutput, ProjectSpec, TaskGraph, TaskNode, TaskEdge, TechStack, Feature, PageSpec, ApiEndpoint, AuthConfig } from "./types.js";

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
  // In production, this would call the AI Router (OpenRouter/Venice)
  // For now, return a structured mock response based on the input
  // TODO: Integrate with actual LLM via AI Router
  
  // This is a simplified implementation - in production, use the AI Router
  return JSON.stringify(generateMockPlan(prompt), null, 2);
}

function generateMockPlan(idea: string): PlannerOutput {
  // Mock planner output - replace with actual LLM call
  const projectName = idea.split(' ').slice(0, 3).join(' ').replace(/[^a-zA-Z0-9]/g, '');
  
  return {
    spec: {
      name: projectName || 'Aethersy Project',
      description: idea,
      type: 'saas',
      tech_stack: {
        frontend: 'nextjs',
        backend: 'fastify',
        database: 'postgresql',
        orm: 'prisma',
        auth: 'better-auth',
        styling: 'tailwind',
        ui_library: 'shadcn',
        testing: 'vitest',
        ci_cd: 'github-actions',
      },
      features: [
        { id: 'auth', name: 'Authentication', description: 'Email/password + OAuth (Google, GitHub)', priority: 'high', tasks: ['backend', 'frontend'] },
        { id: 'dashboard', name: 'User Dashboard', description: 'Main dashboard with metrics', priority: 'high', tasks: ['frontend', 'backend'] },
        { id: 'billing', name: 'Billing/Subscriptions', description: 'Stripe integration for subscriptions', priority: 'high', tasks: ['backend', 'frontend', 'devops'] },
        { id: 'api', name: 'REST API', description: 'CRUD API for core entities', priority: 'medium', tasks: ['backend'] },
      ],
      pages: [
        { route: '/', name: 'Landing', description: 'Marketing landing page', components: ['Hero', 'Features', 'Pricing', 'Footer'] },
        { route: '/login', name: 'Login', description: 'Authentication page', components: ['LoginForm', 'OAuthButtons'] },
        { route: '/register', name: 'Register', description: 'Registration page', components: ['RegisterForm'] },
        { route: '/dashboard', name: 'Dashboard', description: 'Main user dashboard', components: ['Sidebar', 'Metrics', 'ActivityFeed'] },
        { route: '/settings', name: 'Settings', description: 'User settings and billing', components: ['ProfileForm', 'BillingPortal'] },
      ],
      api_endpoints: [
        { method: 'POST', path: '/api/auth/register', description: 'User registration', auth_required: false },
        { method: 'POST', path: '/api/auth/login', description: 'User login', auth_required: false },
        { method: 'GET', path: '/api/user/me', description: 'Current user profile', auth_required: true },
        { method: 'GET', path: '/api/projects', description: 'List user projects', auth_required: true },
        { method: 'POST', path: '/api/projects', description: 'Create project', auth_required: true },
      ],
      auth_config: {
        provider: 'email',
        oauth_providers: ['google', 'github'],
        mfa: true,
        roles: ['user', 'admin'],
      },
      deploy_config: {
        vercel: { framework_preset: 'nextjs', build_command: 'pnpm build', output_directory: '.next' },
        railway: { service_name: 'api', dockerfile_path: 'apps/api/Dockerfile' },
        supabase: { region: 'eu-west-1' },
      },
    },
    task_graph: {
      nodes: [
        {
          id: 'task-brand',
          type: 'brand',
          title: 'Brand Identity & Design System',
          description: 'Create logo, color palette, typography, and UI component library',
          agent: 'brand',
          estimated_credits: 15,
          estimated_duration_minutes: 10,
          spec_template: { action: 'create_brand_kit', project_name: projectName },
        },
        {
          id: 'task-architect',
          type: 'architect',
          title: 'Technical Architecture & Database Schema',
          description: 'Define database schema, API contracts, and project structure',
          agent: 'architect',
          estimated_credits: 20,
          estimated_duration_minutes: 15,
          depends_on: ['task-brand'],
          spec_template: { action: 'create_architecture', tech_stack: 'nextjs+fastify+prisma' },
        },
        {
          id: 'task-backend-auth',
          type: 'backend',
          title: 'Backend: Authentication & User Management',
          description: 'Implement auth endpoints, JWT, OAuth, password reset',
          agent: 'backend',
          estimated_credits: 30,
          estimated_duration_minutes: 20,
          depends_on: ['task-architect'],
          spec_template: { action: 'implement_auth', provider: 'better-auth' },
        },
        {
          id: 'task-backend-api',
          type: 'backend',
          title: 'Backend: Core API & Business Logic',
          description: 'Implement CRUD APIs, validation, error handling',
          agent: 'backend',
          estimated_credits: 40,
          estimated_duration_minutes: 25,
          depends_on: ['task-backend-auth'],
          spec_template: { action: 'implement_api', endpoints: ['projects', 'users', 'billing'] },
        },
        {
          id: 'task-frontend-auth',
          type: 'frontend',
          title: 'Frontend: Auth Pages & State',
          description: 'Build login/register pages, auth context, protected routes',
          agent: 'frontend',
          estimated_credits: 25,
          estimated_duration_minutes: 15,
          depends_on: ['task-brand', 'task-backend-auth'],
          spec_template: { action: 'implement_auth_ui', pages: ['login', 'register', 'forgot-password'] },
        },
        {
          id: 'task-frontend-dashboard',
          type: 'frontend',
          title: 'Frontend: Dashboard & Core Pages',
          description: 'Build dashboard layout, sidebar, main pages, data fetching',
          agent: 'frontend',
          estimated_credits: 35,
          estimated_duration_minutes: 20,
          depends_on: ['task-frontend-auth', 'task-backend-api'],
          spec_template: { action: 'implement_dashboard', pages: ['dashboard', 'settings', 'projects'] },
        },
        {
          id: 'task-copy',
          type: 'copy',
          title: 'Marketing Copy & Content',
          description: 'Write landing page copy, email sequences, onboarding flows',
          agent: 'copy',
          estimated_credits: 15,
          estimated_duration_minutes: 10,
          depends_on: ['task-brand'],
          spec_template: { action: 'write_copy', pages: ['landing', 'pricing', 'features'] },
        },
        {
          id: 'task-devops',
          type: 'devops',
          title: 'DevOps: CI/CD & Deploy',
          description: 'Setup GitHub Actions, Vercel, Railway, Supabase deployments',
          agent: 'devops',
          estimated_credits: 20,
          estimated_duration_minutes: 15,
          depends_on: ['task-backend-api', 'task-frontend-dashboard'],
          spec_template: { action: 'setup_deploy', targets: ['vercel', 'railway', 'supabase'] },
        },
        {
          id: 'task-qa',
          type: 'qa',
          title: 'QA: Testing & Quality Gates',
          description: 'Run unit tests, integration tests, lint, typecheck, security scan',
          agent: 'qa',
          estimated_credits: 10,
          estimated_duration_minutes: 10,
          depends_on: ['task-devops'],
          spec_template: { action: 'run_qa', suite: 'full' },
        },
        {
          id: 'task-growth',
          type: 'growth',
          title: 'Growth: Analytics & Launch Prep',
          description: 'Setup analytics, error tracking, launch checklist',
          agent: 'growth',
          estimated_credits: 10,
          estimated_duration_minutes: 10,
          depends_on: ['task-devops'],
          spec_template: { action: 'setup_analytics', tools: ['posthog', 'sentry'] },
        },
      ],
      edges: [
        { from: 'task-brand', to: 'task-architect' },
        { from: 'task-brand', to: 'task-copy' },
        { from: 'task-brand', to: 'task-frontend-auth' },
        { from: 'task-architect', to: 'task-backend-auth' },
        { from: 'task-backend-auth', to: 'task-backend-api' },
        { from: 'task-backend-auth', to: 'task-frontend-auth' },
        { from: 'task-backend-api', to: 'task-frontend-dashboard' },
        { from: 'task-frontend-auth', to: 'task-frontend-dashboard' },
        { from: 'task-backend-api', to: 'task-devops' },
        { from: 'task-frontend-dashboard', to: 'task-devops' },
        { from: 'task-devops', to: 'task-qa' },
        { from: 'task-devops', to: 'task-growth' },
      ],
    },
    estimated_credits: 220,
    estimated_duration_minutes: 150,
  };
}

export const plannerAgent: PlannerAgent = {
  async plan(input: PlannerInput): Promise<PlannerOutput> {
    const prompt = `IDEA: ${input.idea}
PROJECT TYPE: ${input.project_type ?? 'auto'}
CONSTRAINTS: ${JSON.stringify(input.constraints ?? {})}
CONTEXT: ${JSON.stringify(input.context ?? {})}

Genera il piano completo in JSON.`;

    const response = await callLLM(prompt, PLANNER_SYSTEM_PROMPT);
    
    try {
      return JSON.parse(response);
    } catch {
      // Fallback to mock if parsing fails
      return generateMockPlan(input.idea);
    }
  },
};
