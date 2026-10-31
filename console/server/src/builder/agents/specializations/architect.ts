// builder/agents/specializations/architect.ts — Architect Agent

import { sandboxProvider } from "../sandbox.js";
import type { AgentExecutor, AgentContext, AgentResult, AgentArtifact } from "../types.js";

export const architectAgent: AgentExecutor = {
  async execute(context: AgentContext): Promise<AgentResult> {
    const { task, step, projectId, workspacePath } = context;
    const action = step.input.action as string;

    const artifacts: AgentArtifact[] = [];
    let costCredits = 0;

    switch (action) {
      case 'create_architecture': {
        // Generate project structure, database schema, API contracts
        const techStack = step.input.tech_stack as string ?? 'nextjs+fastify+prisma';
        
        // 1. Create directory structure
        await sandboxProvider.exec({
          command: 'mkdir',
          args: ['-p', 'apps/web', 'apps/api', 'packages/shared', 'packages/db'],
          workdir: workspacePath,
        });

        // 2. Generate Prisma schema
        const prismaSchema = generatePrismaSchema(task.spec);
        await sandboxProvider.exec({
          command: 'bash',
          args: ['-c', `cat > packages/db/prisma/schema.prisma << 'EOF'\n${prismaSchema}\nEOF`],
          workdir: workspacePath,
        });
        artifacts.push({
          kind: 'code',
          name: 'prisma/schema.prisma',
          content: prismaSchema,
          metadata: { path: 'packages/db/prisma/schema.prisma', description: 'Database schema' },
        });

        // 3. Generate API contracts (OpenAPI)
        const openApiSpec = generateOpenApiSpec(task.spec);
        await sandboxProvider.exec({
          command: 'bash',
          args: ['-c', `cat > packages/shared/api/openapi.yaml << 'EOF'\n${openApiSpec}\nEOF`],
          workdir: workspacePath,
        });
        artifacts.push({
          kind: 'code',
          name: 'shared/api/openapi.yaml',
          content: openApiSpec,
          metadata: { path: 'packages/shared/api/openapi.yaml', description: 'OpenAPI specification' },
        });

        // 4. Generate project config files
        await generateConfigFiles(workspacePath, techStack, artifacts);

        costCredits = 20;
        break;
      }

      case 'define_db_schema': {
        // Just generate Prisma schema
        const prismaSchema = generatePrismaSchema(task.spec);
        await sandboxProvider.exec({
          command: 'bash',
          args: ['-c', `cat > packages/db/prisma/schema.prisma << 'EOF'\n${prismaSchema}\nEOF`],
          workdir: workspacePath,
        });
        artifacts.push({
          kind: 'code',
          name: 'prisma/schema.prisma',
          content: prismaSchema,
          metadata: { path: 'packages/db/prisma/schema.prisma' },
        });
        costCredits = 10;
        break;
      }

      case 'define_api_contracts': {
        const openApiSpec = generateOpenApiSpec(task.spec);
        await sandboxProvider.exec({
          command: 'bash',
          args: ['-c', `cat > packages/shared/api/openapi.yaml << 'EOF'\n${openApiSpec}\nEOF`],
          workdir: workspacePath,
        });
        artifacts.push({
          kind: 'code',
          name: 'shared/api/openapi.yaml',
          content: openApiSpec,
          metadata: { path: 'packages/shared/api/openapi.yaml' },
        });
        costCredits = 10;
        break;
      }

      default:
        throw new Error(`Unknown architect action: ${action}`);
    }

    return {
      output: { architecture: 'completed', artifacts: artifacts.map(a => a.name) },
      artifacts,
      costCredits,
      stepsCompleted: 1,
    };
  },
};

function generatePrismaSchema(spec: Record<string, unknown>): string {
  // Extract features from spec to generate appropriate models
  const features = (spec.features as Array<{id: string}>) ?? [];
  const hasAuth = features.some(f => f.id === 'auth');
  const hasBilling = features.some(f => f.id === 'billing');
  const hasProjects = features.some(f => f.id === 'projects');

  let schema = `// Prisma Schema for ${spec.name ?? 'Aethersy Project'}
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id            String    @id @default(cuid())
  email         String    @unique
  name          String?
  passwordHash  String?
  image         String?
  emailVerified DateTime?
  role          String    @default("user")
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  accounts      Account[]
  sessions      Session[]
`;

  if (hasAuth) {
    schema += `  // Auth relations handled via Account/Session models
`;
  }

  if (hasProjects) {
    schema += `  projects      Project[]
`;
  }

  if (hasBilling) {
    schema += `  subscriptions Subscription[]
    invoices      Invoice[]
`;
  }

  schema += `}

model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String? @db.Text
  access_token      String? @db.Text
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String? @db.Text
  session_state     String?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime

  @@unique([identifier, token])
}
`;

  if (hasProjects) {
    schema += `
model Project {
  id          String   @id @default(cuid())
  name        String
  description String?
  type        String   @default("saas")
  spec        Json
  repoUrl     String?
  status      String   @default("active")
  userId      String
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([userId])
}
`;
  }

  if (hasBilling) {
    schema += `
model Subscription {
  id                   String   @id @default(cuid())
  userId               String
  stripeCustomerId     String   @unique
  stripeSubscriptionId String?  @unique
  stripePriceId        String?
  stripeCurrentPeriodEnd DateTime?
  status               String   @default("active")
  cancelAtPeriodEnd    Boolean  @default(false)
  createdAt            DateTime @default(now())
  updatedAt            DateTime @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
}

model Invoice {
  id              String   @id @default(cuid())
  userId          String
  stripeInvoiceId String   @unique
  amount          Int
  currency        String   @default("usd")
  status          String
  invoicePdf      String?
  hostedInvoiceUrl String?
  createdAt       DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
}
`;
  }

  return schema;
}

function generateOpenApiSpec(spec: Record<string, unknown>): string {
  const endpoints = (spec.api_endpoints as Array<{method: string; path: string; description: string; auth_required: boolean}>) ?? [];

  let yaml = `openapi: 3.0.3
info:
  title: ${spec.name ?? 'Aethersy Project'} API
  version: 1.0.0
  description: Auto-generated API specification
servers:
  - url: /api
    description: Development server
paths:
`;

  for (const ep of endpoints) {
    yaml += `  ${ep.path}:
    ${ep.method.toLowerCase()}:
      summary: ${ep.description}
      operationId: ${ep.method.toLowerCase()}${ep.path.replace(/[^a-zA-Z0-9]/g, '_')}
      security:
${ep.auth_required ? '        - bearerAuth: []' : '        - []'}
      responses:
        '200':
          description: Successful response
        '400':
          description: Bad request
        '401':
          description: Unauthorized
        '500':
          description: Internal server error
`;
  }

  yaml += `
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
`;

  return yaml;
}

async function generateConfigFiles(workspacePath: string, techStack: string, artifacts: AgentArtifact[]): Promise<void> {
  // package.json for monorepo
  const packageJson = {
    name: '@aethersy/monorepo',
    private: true,
    workspaces: ['apps/*', 'packages/*'],
    scripts: {
      dev: 'turbo run dev',
      build: 'turbo run build',
      lint: 'turbo run lint',
      test: 'turbo run test',
      'db:generate': 'turbo run db:generate --filter=@aethersy/db',
      'db:push': 'turbo run db:push --filter=@aethersy/db',
    },
    devDependencies: {
      turbo: '^2.0.0',
      typescript: '^5.5.0',
      eslint: '^9.0.0',
      prettier: '^3.3.0',
    },
  };

  await sandboxProvider.exec({
    command: 'bash',
    args: ['-c', `cat > package.json << 'EOF'\n${JSON.stringify(packageJson, null, 2)}\nEOF`],
    workdir: workspacePath,
  });
  artifacts.push({
    kind: 'config',
    name: 'package.json',
    content: JSON.stringify(packageJson, null, 2),
    metadata: { path: 'package.json' },
  });

  // turbo.json
  const turboJson = {
    $schema: 'https://turbo.build/schema.json',
    pipeline: {
      build: { dependsOn: ['^build'], outputs: ['dist/**', '.next/**'] },
      dev: { cache: false, persistent: true },
      lint: { outputs: [] },
      test: { outputs: ['coverage/**'] },
      'db:generate': { outputs: ['node_modules/.prisma/client/**'] },
      'db:push': {},
    },
  };

  await sandboxProvider.exec({
    command: 'bash',
    args: ['-c', `cat > turbo.json << 'EOF'\n${JSON.stringify(turboJson, null, 2)}\nEOF`],
    workdir: workspacePath,
  });
  artifacts.push({
    kind: 'config',
    name: 'turbo.json',
    content: JSON.stringify(turboJson, null, 2),
    metadata: { path: 'turbo.json' },
  });

  // tsconfig.base.json
  const tsconfig = {
    compilerOptions: {
      target: 'ES2022',
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      lib: ['ES2022'],
      strict: true,
      skipLibCheck: true,
      esModuleInterop: true,
      allowSyntheticDefaultImports: true,
      forceConsistentCasingInFileNames: true,
      resolveJsonModule: true,
      isolatedModules: true,
      noEmit: true,
      baseUrl: '.',
      paths: {
        '@aethersy/shared/*': ['packages/shared/*'],
        '@aethersy/db/*': ['packages/db/*'],
      },
    },
  };

  await sandboxProvider.exec({
    command: 'bash',
    args: ['-c', `cat > tsconfig.base.json << 'EOF'\n${JSON.stringify(tsconfig, null, 2)}\nEOF`],
    workdir: workspacePath,
  });
  artifacts.push({
    kind: 'config',
    name: 'tsconfig.base.json',
    content: JSON.stringify(tsconfig, null, 2),
    metadata: { path: 'tsconfig.base.json' },
  });
}
