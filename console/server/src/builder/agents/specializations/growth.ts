// builder/agents/specializations/growth.ts — Growth Agent

import { sandboxProvider } from "../sandbox.js";
import type { AgentExecutor, AgentContext, AgentResult, AgentArtifact } from "../types.js";

export const growthAgent: AgentExecutor = {
  async execute(context: AgentContext): Promise<AgentResult> {
    const { task, step, projectId, workspacePath } = context;
    const action = step.input.action as string;

    const artifacts: AgentArtifact[] = [];
    let costCredits = 0;

    switch (action) {
      case 'setup_analytics': {
        // Setup analytics tracking (PostHog, Sentry, etc.)
        await sandboxProvider.exec({
          command: 'bash',
          args: ['-c', `mkdir -p packages/shared/analytics`], workdir: workspacePath,
        });
        artifacts.push({
          kind: 'config',
          name: 'packages/shared/analytics/index.ts',
          content: `// Analytics setup for Aethersy
export const TRACK_EVENT = (event: string, properties?: Record<string, unknown>) => {
  // TODO: Integrate with PostHog/Sentry
  console.log('TRACK:', event, properties);
};
`,
          metadata: { path: 'packages/shared/analytics/index.ts' },
        });

        // Generate event types
        const eventTypes = generateEventTypes();
        await writeFile(workspacePath, 'packages/shared/analytics/events.ts', eventTypes, artifacts);

        costCredits = 10;
        break;
      }

      case 'setup_error_tracking': {
        // Setup error tracking
        await sandboxProvider.exec({
          command: 'bash',
          args: ['-c', `mkdir -p packages/shared/errors`], workdir: workspacePath,
        });
        artifacts.push({
          kind: 'config',
          name: 'packages/shared/errors/index.ts',
          content: `// Error tracking setup
export const captureError = (error: Error, context?: Record<string, unknown>) => {
  // TODO: Integrate with Sentry
  console.log('ERROR:', error, context);
};
`,
          metadata: { path: 'packages/shared/errors/index.ts' },
        });
        costCredits = 5;
        break;
      }

      case 'launch_checklist': {
        // Generate launch checklist
        const checklist = generateLaunchChecklist();
        await writeFile(workspacePath, 'packages/shared/launch/checklist.ts', checklist, artifacts);

        // Generate deployment config
        const deployConfig = generateDeployConfig();
        await writeFile(workspacePath, 'packages/shared/launch/deploy-config.ts', deployConfig, artifacts);

        costCredits = 8;
        break;
      }

      default:
        throw new Error(`Unknown growth action: ${action}`);
    }

    return {
      output: { growth: 'completed' },
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
    kind: 'document',
    name: filePath,
    content,
    metadata: { path: filePath },
  });
}

function generateEventTypes(): string {
  return `export type AnalyticsEvent =
  | 'page_view'
  | 'button_click'
  | 'form_submit'
  | 'login'
  | 'signup'
  | 'subscription_created'
  | 'subscription_cancelled'
  | 'pricing_view'
  | 'pricing_select';

export interface PageViewEvent {
  event: 'page_view';
  properties: {
    page: string;
    path: string;
    referrer?: string;
    timestamp: string;
  };
}

export interface ButtonClickEvent {
  event: 'button_click';
  properties: {
    button_id: string;
    button_text: string;
    page: string;
  };
}

export interface FormSubmitEvent {
  event: 'form_submit';
  properties: {
    form_id: string;
    form_name: string;
    fields: Record<string, string>;
  };
}

export interface LoginEvent {
  event: 'login';
  properties: {
    method: 'email' | 'oauth';
    success: boolean;
  };
}

export interface SignupEvent {
  event: 'signup';
  properties: {
    method: 'email' | 'oauth';
    success: boolean;
  };
}

export interface SubscriptionCreatedEvent {
  event: 'subscription_created';
  properties: {
    plan: 'startup' | 'pro' | 'enterprise';
    amount: number;
    currency: string;
  };
}

export interface SubscriptionCancelledEvent {
  event: 'subscription_cancelled';
  properties: {
    plan: 'startup' | 'pro' | 'enterprise';
    cancel_at_period_end: boolean;
  };
}

export interface PricingViewEvent {
  event: 'pricing_view';
  properties: {
    plan: 'startup' | 'pro' | 'enterprise';
    time_on_page_seconds: number;
  };
}

export interface PricingSelectEvent {
  event: 'pricing_select';
  properties: {
    plan: 'startup' | 'pro' | 'enterprise';
    amount: number;
  };
}`
}

function generateLaunchChecklist(): string {
  return `export interface ChecklistItem {
  id: string;
  category: 'code' | 'design' | 'marketing' | 'deploy' | 'qa';
  title: string;
  description: string;
  completed: boolean;
  completed_at?: string;
}

export const LAUNCH_CHECKLIST: ChecklistItem[] = [
  // Code
  {
    id: 'code-1',
    category: 'code',
    title: 'Database migrations tested',
    description: 'Tutte le migrazioni sono state eseguite e testate in ambiente di staging',
    completed: false,
  },
  {
    id: 'code-2',
    category: 'code',
    title: 'Test unitari > 80% coverage',
    description: 'Coverage minima per i test unitari del backend e frontend',
    completed: false,
  },
  // Design
  {
    id: 'design-1',
    category: 'design',
    title: 'Brand identity completa',
    description: 'Logo, palette colori, tipografia e system di design implementati',
    completed: false,
  },
  {
    id: 'design-2',
    category: 'design',
    title: 'UI responsive su mobile/desktop',
    description: 'Tutte le pagine sono testate su mobile, tablet e desktop',
    completed: false,
  },
  // Marketing
  {
    id: 'marketing-1',
    category: 'marketing',
    title: 'Copywriting completato',
    description: 'Landing page, email sequences e ad copies sono pronti',
    completed: false,
  },
  {
    id: 'marketing-2',
    category: 'marketing',
    title: 'Analytics configurata',
    description: 'Eventi di tracciamento e funnel configurati correttamente',
    completed: false,
  },
  // Deploy
  {
    id: 'deploy-1',
    category: 'deploy',
    title: 'CI/CD configurato',
    description: 'GitHub Actions o pipeline equivalente è attivo e funzionante',
    completed: false,
  },
  {
    id: 'deploy-2',
    category: 'deploy',
    title: 'Deploy su Vercel/Railway/Supabase',
    description: 'L'applicazione è deployata su tutti i target configurati',
    completed: false,
  },
  // QA
  {
    id: 'qa-1',
    category: 'qa',
    title: 'Lint e typecheck passati',
    description: 'Nessun errore ESLint o TypeScript',
    completed: false,
  },
  {
    id: 'qa-2',
    category: 'qa',
    title: 'Test end-to-end',
    description: 'Tutti i flussi critici sono testati (login, onboarding, checkout)',
    completed: false,
  },
];

export const PRE_DEPLOY_CHECKLIST = [
  'Variabili d\'ambiente configurate su tutti gli ambienti',
  'Dominio personalizzato configurato',
  'SSL/HTTPS attivo',
  'Stripe/Paddle webhook verificato',
  'Backup database programmato',
  'Monitoraggio errori attivo',
];
`
}

function generateDeployConfig(): string {
  return `export interface DeployConfig {
  vercel: {
    projectId: string;
    domain?: string;
    env: Record<string, string>;
  };
  railway: {
    environmentId: string;
    domain?: string;
    env: Record<string, string>;
  };
  supabase: {
    projectRef: string;
    region: string;
    env: Record<string, string>;
  };
}

export const DEFAULT_DEPLOY_CONFIG: DeployConfig = {
  vercel: {
    projectId: '',
    env: {
      NODE_ENV: 'production',
      DATABASE_URL: '',
      STRIPE_SECRET_KEY: '',
      JWT_SECRET: '',
    },
  },
  railway: {
    environmentId: '',
    env: {
      NODE_ENV: 'production',
      DATABASE_URL: '',
      STRIPE_SECRET_KEY: '',
      JWT_SECRET: '',
    },
  },
  supabase: {
    projectRef: '',
    region: 'us-east-1',
    env: {
      NODE_ENV: 'production',
      DATABASE_URL: '',
      STRIPE_SECRET_KEY: '',
      JWT_SECRET: '',
    },
  },
};
`
}
