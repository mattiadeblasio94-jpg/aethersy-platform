// builder/agents/specializations/devops.ts — DevOps Agent

import { sandboxProvider } from "../sandbox.js";
import type { AgentExecutor, AgentContext, AgentResult, AgentArtifact } from "../types.js";

export const devopsAgent: AgentExecutor = {
  async execute(context: AgentContext): Promise<AgentResult> {
    const { task, step, projectId, workspacePath } = context;
    const action = step.input.action as string;

    const artifacts: AgentArtifact[] = [];
    let costCredits = 0;

    switch (action) {
      case 'setup_ci': {
        const workflow = generateGithubWorkflow();
        await writeFile(workspacePath, '.github/workflows/ci.yml', workflow, artifacts);
        costCredits = 5;
        break;
      }

      case 'create_dockerfile': {
        const dockerfile = generateDockerfile();
        await writeFile(workspacePath, 'Dockerfile', dockerfile, artifacts);
        costCredits = 5;
        break;
      }

      case 'create_docker_compose': {
        const compose = generateDockerCompose();
        await writeFile(workspacePath, 'docker-compose.yml', compose, artifacts);
        costCredits = 5;
        break;
      }

      case 'configure_env': {
        const envExample = generateEnvExample();
        await writeFile(workspacePath, '.env.example', envExample, artifacts);
        costCredits = 3;
        break;
      }

      case 'deploy_prepare': {
        // Il deploy vero e proprio viene eseguito dal task "deploy" che usa le
        // API di Vercel/Railway/Supabase: qui prepariamo i file necessari.
        const buildScript = generateBuildScript();
        await writeFile(workspacePath, 'scripts/build.sh', buildScript, artifacts);
        costCredits = 8;
        break;
      }

      default:
        throw new Error(`Unknown devops action: ${action}`);
    }

    return {
      output: { devops: 'completed', action },
      artifacts,
      costCredits,
      stepsCompleted: 1,
    };
  },
};

function writeFile(
  workspacePath: string,
  filePath: string,
  content: string,
  artifacts: AgentArtifact[],
): Promise<void> {
  return sandboxProvider
    .exec({
      command: 'bash',
      args: ['-c', `mkdir -p "$(dirname ${filePath})" && cat > ${filePath} << 'EOF'\n${content}\nEOF`],
      workdir: workspacePath,
    })
    .then(() => {
      artifacts.push({
        kind: 'config',
        name: filePath,
        content,
        metadata: { path: filePath },
      });
    });
}

function generateGithubWorkflow(): string {
  return `name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test
`;
}

function generateDockerfile(): string {
  return `FROM node:22-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile

FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
EXPOSE 3000
CMD ["node", "dist/index.js"]
`;
}

function generateDockerCompose(): string {
  return `services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: production
    restart: unless-stopped

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: \${POSTGRES_USER:-app}
      POSTGRES_PASSWORD: \${POSTGRES_PASSWORD:-app}
      POSTGRES_DB: \${POSTGRES_DB:-app}
    volumes:
      - pgdata:/var/lib/postgresql/data
    restart: unless-stopped

volumes:
  pgdata:
`;
}

function generateEnvExample(): string {
  return `# Copia questo file in .env e riempi i valori. Non committare .env
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://app:app@localhost:5432/app
REDIS_URL=redis://localhost:6379
OPENAI_API_KEY=
OPENROUTER_API_KEY=
`;
}

function generateBuildScript(): string {
  return `#!/usr/bin/env bash
set -euo pipefail

echo "[build] installazione dipendenze"
pnpm install --frozen-lockfile

echo "[build] typecheck"
pnpm typecheck

echo "[build] build"
pnpm build

echo "[build] completato"
`;
}
