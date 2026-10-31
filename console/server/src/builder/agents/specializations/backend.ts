// builder/agents/specializations/backend.ts — Backend Agent

import { sandboxProvider } from "../sandbox.js";
import type { AgentExecutor, AgentContext, AgentResult, AgentArtifact } from "../types.js";

export const backendAgent: AgentExecutor = {
  async execute(context: AgentContext): Promise<AgentResult> {
    const { task, step, projectId, workspacePath } = context;
    const action = step.input.action as string;

    const artifacts: AgentArtifact[] = [];
    let costCredits = 0;

    switch (action) {
      case 'implement_auth': {
        const provider = step.input.provider as string ?? 'better-auth';
        
        // Create Fastify app structure
        await sandboxProvider.exec({
          command: 'mkdir',
          args: ['-p', 'apps/api/src/{routes,plugins,services,middleware,utils,config}', 'apps/api/prisma'],
          workdir: workspacePath,
        });

        // Generate package.json for API
        const apiPackageJson = generateApiPackageJson(provider);
        await writeFile(workspacePath, 'apps/api/package.json', apiPackageJson, artifacts);

        // Generate Fastify app entry point
        const appTs = generateFastifyApp(provider);
        await writeFile(workspacePath, 'apps/api/src/app.ts', appTs, artifacts);

        // Generate auth plugin
        const authPlugin = generateAuthPlugin(provider);
        await writeFile(workspacePath, 'apps/api/src/plugins/auth.ts', authPlugin, artifacts);

        // Generate auth routes
        const authRoutes = generateAuthRoutes();
        await writeFile(workspacePath, 'apps/api/src/routes/auth.ts', authRoutes, artifacts);

        // Generate user routes
        const userRoutes = generateUserRoutes();
        await writeFile(workspacePath, 'apps/api/src/routes/user.ts', userRoutes, artifacts);

        // Generate Prisma client wrapper
        const prismaClient = generatePrismaClient();
        await writeFile(workspacePath, 'apps/api/src/utils/prisma.ts', prismaClient, artifacts);

        // Generate config
        const configTs = generateApiConfig();
        await writeFile(workspacePath, 'apps/api/src/config/index.ts', configTs, artifacts);

        // Generate TypeScript config
        const tsconfig = generateApiTsConfig();
        await writeFile(workspacePath, 'apps/api/tsconfig.json', tsconfig, artifacts);

        costCredits = 30;
        break;
      }

      case 'implement_api': {
        const endpoints = (step.input.endpoints as string[]) ?? ['projects', 'users', 'billing'];
        
        for (const endpoint of endpoints) {
          const routeFile = generateCrudRoutes(endpoint);
          await writeFile(workspacePath, `apps/api/src/routes/${endpoint}.ts`, routeFile, artifacts);
        }

        // Generate services
        for (const endpoint of endpoints) {
          const serviceFile = generateService(endpoint);
          await writeFile(workspacePath, `apps/api/src/services/${endpoint}.ts`, serviceFile, artifacts);
        }

        costCredits = 40;
        break;
      }

      case 'setup_database': {
        // Run Prisma generate and push
        const result = await sandboxProvider.exec({
          command: 'pnpm',
          args: ['db:generate'],
          workdir: workspacePath,
        });
        artifacts.push({
          kind: 'log',
          name: 'prisma-generate.log',
          content: result.stdout + result.stderr,
          metadata: { command: 'pnpm db:generate' },
        });

        const pushResult = await sandboxProvider.exec({
          command: 'pnpm',
          args: ['db:push'],
          workdir: workspacePath,
        });
        artifacts.push({
          kind: 'log',
          name: 'prisma-push.log',
          content: pushResult.stdout + pushResult.stderr,
          metadata: { command: 'pnpm db:push' },
        });

        costCredits = 5;
        break;
      }

      default:
        throw new Error(`Unknown backend action: ${action}`);
    }

    return {
      output: { backend: 'completed', artifacts: artifacts.map(a => a.name) },
      artifacts,
      costCredits,
      stepsCompleted: 1,
    };
  },
};

async function writeFile(workspacePath: string, filePath: string, content: string, artifacts: AgentArtifact[]): Promise<void> {
  await sandboxProvider.exec({
    command: 'bash',
    args: ['-c', `cat > ${filePath} << 'EOF'\n${content}\nEOF`],
    workdir: workspacePath,
  });
  artifacts.push({
    kind: 'code',
    name: filePath,
    content,
    metadata: { path: filePath },
  });
}

function generateApiPackageJson(provider: string): string {
  const pkg = {
    name: '@aethersy/api',
    version: '0.1.0',
    private: true,
    main: 'dist/app.js',
    types: 'dist/app.d.ts',
    scripts: {
      dev: 'tsx watch src/app.ts',
      build: 'tsc',
      start: 'node dist/app.js',
      'db:generate': 'prisma generate',
      'db:push': 'prisma db push',
      'db:studio': 'prisma studio',
      lint: 'eslint src --ext .ts',
      test: 'vitest run',
    },
    dependencies: {
      '@fastify/cookie': '^9.3.1',
      '@fastify/cors': '^9.0.1',
      '@fastify/jwt': '^8.0.1',
      '@fastify/rate-limit': '^9.1.0',
      '@fastify/sensible': '^5.6.0',
      '@fastify/swagger': '^8.14.0',
      '@fastify/swagger-ui': '^4.0.1',
      '@prisma/client': '^5.15.0',
      'better-auth': '^0.5.0',
      'fastify': '^4.28.0',
      'fastify-type-provider-zod': '^1.2.0',
      'zod': '^3.23.0',
      'dotenv': '^16.4.5',
      'bcryptjs': '^2.4.3',
    },
    devDependencies: {
      '@types/node': '^20.14.0',
      '@types/bcryptjs': '^2.4.6',
      'prisma': '^5.15.0',
      'tsx': '^4.15.0',
      'typescript': '^5.5.0',
      'vitest': '^2.0.0',
      'eslint': '^9.0.0',
      '@typescript-eslint/eslint-plugin': '^8.0.0',
      '@typescript-eslint/parser': '^8.0.0',
    },
  };
  return JSON.stringify(pkg, null, 2);
}

function generateFastifyApp(provider: string): string {
  return `import Fastify from 'fastify';
import { config } from './config/index.js';
import { authPlugin } from './plugins/auth.js';
import { authRoutes } from './routes/auth.js';
import { userRoutes } from './routes/user.js';
import { projectRoutes } from './routes/projects.js';
import { billingRoutes } from './routes/billing.js';
import sensible from '@fastify/sensible';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';

const app = Fastify({
  logger: true,
  ajv: { customOptions: { removeAdditional: 'all' } },
});

// Plugins
await app.register(sensible);
await app.register(cors, { origin: config.corsOrigin, credentials: true });
await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });
await app.register(authPlugin);

// Routes
await app.register(authRoutes, { prefix: '/api/auth' });
await app.register(userRoutes, { prefix: '/api/user' });
await app.register(projectRoutes, { prefix: '/api/projects' });
await app.register(billingRoutes, { prefix: '/api/billing' });

// Health check
app.get('/health', async () => ({ status: 'ok', service: 'aethersy-api' }));

// Error handler
app.setErrorHandler((error, request, reply) => {
  app.log.error(error);
  const statusCode = error.statusCode ?? 500;
  return reply.code(statusCode).send({
    error: error.name,
    message: error.message,
    statusCode,
  });
});

export async function start() {
  try {
    await app.listen({ port: config.port, host: config.host });
    app.log.info(\`API server listening on \${config.host}:\${config.port}\`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();

export { app };
`;
}

function generateAuthPlugin(provider: string): string {
  return `import { FastifyInstance } from 'fastify';
import { config } from '../config/index.js';
import { prisma } from '../utils/prisma.js';
import jwt from '@fastify/jwt';
import cookie from '@fastify/cookie';

export async function authPlugin(app: FastifyInstance) {
  // JWT
  await app.register(jwt, {
    secret: config.jwtSecret,
    cookie: { cookieName: 'auth_token', signed: false },
    sign: { expiresIn: '7d' },
  });

  // Cookie
  await app.register(cookie, {
    secret: config.cookieSecret,
    hook: 'onRequest',
    parseOptions: { httpOnly: true, secure: config.nodeEnv === 'production', sameSite: 'lax' },
  });

  // Decorate request with user
  app.decorateRequest('user', null);

  // Auth hook
  app.addHook('preHandler', async (request, reply) => {
    const token = request.cookies.auth_token;
    if (!token) return;

    try {
      const decoded = app.jwt.verify<{ sub: string; email: string }>(token);
      const user = await prisma.user.findUnique({ where: { id: decoded.sub } });
      if (user) {
        request.user = { id: user.id, email: user.email, name: user.name, role: user.role };
      }
    } catch {
      // Invalid token - clear cookie
      reply.clearCookie('auth_token');
    }
  });
}

// Type augmentation
declare module 'fastify' {
  interface FastifyRequest {
    user: { id: string; email: string; name: string | null; role: string } | null;
  }
}
`;
}

function generateAuthRoutes(): string {
  return `import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '../utils/prisma.js';

const registerSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(8),
    name: z.string().min(2).optional(),
  }),
});

const loginSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string(),
  }),
});

export async function authRoutes(app: FastifyInstance) {
  // Register
  app.post('/register', { schema: registerSchema }, async (request, reply) => {
    const { email, password, name } = request.body;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return reply.code(400).send({ error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { email, passwordHash, name },
      select: { id: true, email: true, name: true, role: true, createdAt: true },
    });

    const token = app.jwt.sign({ sub: user.id, email: user.email });
    reply.setCookie('auth_token', token, { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 60 * 60 * 24 * 7 });
    return { user, token };
  });

  // Login
  app.post('/login', { schema: loginSchema }, async (request, reply) => {
    const { email, password } = request.body;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.passwordHash) {
      return reply.code(401).send({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return reply.code(401).send({ error: 'Invalid credentials' });
    }

    const token = app.jwt.sign({ sub: user.id, email: user.email });
    reply.setCookie('auth_token', token, { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 60 * 60 * 24 * 7 });
    return { user: { id: user.id, email: user.email, name: user.name, role: user.role }, token };
  });

  // Logout
  app.post('/logout', async (request, reply) => {
    reply.clearCookie('auth_token');
    return { success: true };
  });

  // Me
  app.get('/me', async (request, reply) => {
    if (!request.user) {
      return reply.code(401).send({ error: 'Not authenticated' });
    }
    return { user: request.user };
  });

  // Refresh
  app.post('/refresh', async (request, reply) => {
    const token = request.cookies.auth_token;
    if (!token) {
      return reply.code(401).send({ error: 'No token' });
    }
    try {
      const decoded = app.jwt.verify<{ sub: string; email: string }>(token);
      const user = await prisma.user.findUnique({ where: { id: decoded.sub } });
      if (!user) {
        return reply.code(401).send({ error: 'User not found' });
      }
      const newToken = app.jwt.sign({ sub: user.id, email: user.email });
      reply.setCookie('auth_token', newToken, { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 60 * 60 * 24 * 7 });
      return { user: { id: user.id, email: user.email, name: user.name, role: user.role }, token: newToken };
    } catch {
      reply.clearCookie('auth_token');
      return reply.code(401).send({ error: 'Invalid token' });
    }
  });
}
`;
}

function generateUserRoutes(): string {
  return `import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../utils/prisma.js';

const updateProfileSchema = z.object({
  body: z.object({
    name: z.string().min(2).optional(),
    image: z.string().url().optional(),
  }),
});

export async function userRoutes(app: FastifyInstance) {
  // All routes require authentication
  app.addHook('preHandler', async (request, reply) => {
    if (!request.user) {
      return reply.code(401).send({ error: 'Authentication required' });
    }
  });

  // Get profile
  app.get('/profile', async (request) => {
    const user = await prisma.user.findUnique({
      where: { id: request.user!.id },
      select: { id: true, email: true, name: true, image: true, role: true, createdAt: true },
    });
    return { user };
  });

  // Update profile
  app.patch('/profile', { schema: updateProfileSchema }, async (request, reply) => {
    const { name, image } = request.body;
    const user = await prisma.user.update({
      where: { id: request.user!.id },
      data: { name, image },
      select: { id: true, email: true, name: true, image: true, role: true },
    });
    return { user };
  });

  // Delete account
  app.delete('/account', async (request, reply) => {
    await prisma.user.delete({ where: { id: request.user!.id } });
    reply.clearCookie('auth_token');
    return { success: true };
  });
}
`;
}

function generateCrudRoutes(entity: string): string {
  const capitalized = entity.charAt(0).toUpperCase() + entity.slice(1);
  return `import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../utils/prisma.js';
import { ${capitalized}Service } from '../services/${entity}.js';

const createSchema = z.object({
  body: z.object({
    // Define based on entity
  }),
});

const updateSchema = z.object({
  params: z.object({ id: z.string() }),
  body: z.object({
    // Define based on entity
  }).partial(),
});

const listSchema = z.object({
  querystring: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    search: z.string().optional(),
  }),
});

export async function ${entity}Routes(app: FastifyInstance) {
  app.addHook('preHandler', async (request, reply) => {
    if (!request.user) {
      return reply.code(401).send({ error: 'Authentication required' });
    }
  });

  const service = new ${capitalized}Service(prisma, request.user!.id);

  app.get('/', { schema: listSchema }, async (request) => {
    return service.list(request.query);
  });

  app.post('/', { schema: createSchema }, async (request, reply) => {
    return reply.code(201).send(await service.create(request.body));
  });

  app.get('/:id', async (request, reply) => {
    const { params } = request as any;
    const item = await service.getById(params.id);
    if (!item) return reply.code(404).send({ error: 'Not found' });
    return item;
  });

  app.patch('/:id', { schema: updateSchema }, async (request, reply) => {
    const { params } = request as any;
    const item = await service.update(params.id, request.body);
    if (!item) return reply.code(404).send({ error: 'Not found' });
    return item;
  });

  app.delete('/:id', async (request, reply) => {
    const { params } = request as any;
    const deleted = await service.delete(params.id);
    if (!deleted) return reply.code(404).send({ error: 'Not found' });
    return { success: true };
  });
}
`;
}

function generateService(entity: string): string {
  const capitalized = entity.charAt(0).toUpperCase() + entity.slice(1);
  return `import { PrismaClient } from '@prisma/client';

export class ${capitalized}Service {
  constructor(private prisma: PrismaClient, private userId: string) {}

  async list(query: { page: number; limit: number; search?: string }) {
    const { page, limit, search } = query;
    const skip = (page - 1) * limit;
    
    const where: any = { userId: this.userId };
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.${entity.toLowerCase()}.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
      prisma.${entity.toLowerCase()}.count({ where }),
    ]);

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async create(data: any) {
    return prisma.${entity.toLowerCase()}.create({ data: { ...data, userId: this.userId } });
  }

  async getById(id: string) {
    return prisma.${entity.toLowerCase()}.findFirst({ where: { id, userId: this.userId } });
  }

  async update(id: string, data: any) {
    const existing = await prisma.${entity.toLowerCase()}.findFirst({ where: { id, userId: this.userId } });
    if (!existing) return null;
    return prisma.${entity.toLowerCase()}.update({ where: { id }, data });
  }

  async delete(id: string) {
    const existing = await prisma.${entity.toLowerCase()}.findFirst({ where: { id, userId: this.userId } });
    if (!existing) return false;
    await prisma.${entity.toLowerCase()}.delete({ where: { id } });
    return true;
  }
}
`;
}

function generatePrismaClient(): string {
  return `import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export default prisma;
`;
}

function generateApiConfig(): string {
  return `import "dotenv/config";

export const config = {
  port: Number(process.env.PORT ?? 3001),
  host: process.env.HOST ?? '0.0.0.0',
  nodeEnv: process.env.NODE_ENV ?? 'development',
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
  jwtSecret: process.env.JWT_SECRET ?? 'dev-secret-change-in-production',
  cookieSecret: process.env.COOKIE_SECRET ?? 'dev-cookie-secret-change-in-production',
  databaseUrl: process.env.DATABASE_URL ?? '',
  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? '',
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? '',
};
`;
}

function generateApiTsConfig(): string {
  return JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      lib: ['ES2022'],
      outDir: 'dist',
      rootDir: 'src',
      strict: true,
      skipLibCheck: true,
      esModuleInterop: true,
      allowSyntheticDefaultImports: true,
      forceConsistentCasingInFileNames: true,
      resolveJsonModule: true,
      isolatedModules: true,
      declaration: true,
      declarationMap: true,
      sourceMap: true,
      baseUrl: '.',
      paths: {
        '@aethersy/shared/*': ['../../packages/shared/*'],
        '@aethersy/db/*': ['../../packages/db/*'],
      },
    },
    include: ['src/**/*'],
    exclude: ['node_modules', 'dist'],
  }, null, 2);
}
