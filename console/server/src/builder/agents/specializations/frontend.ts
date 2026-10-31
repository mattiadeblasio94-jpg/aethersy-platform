// builder/agents/specializations/frontend.ts — Frontend Agent

import { sandboxProvider } from "../sandbox.js";
import type { AgentExecutor, AgentContext, AgentResult, AgentArtifact } from "../types.js";

export const frontendAgent: AgentExecutor = {
  async execute(context: AgentContext): Promise<AgentResult> {
    const { task, step, projectId, workspacePath } = context;
    const action = step.input.action as string;

    const artifacts: AgentArtifact[] = [];
    let costCredits = 0;

    switch (action) {
      case 'implement_auth_ui': {
        const pages = (step.input.pages as string[]) ?? ['login', 'register', 'forgot-password'];

        for (const page of pages) {
          const pageComponent = generatePageComponent(page);
          await writeFile(workspacePath, `apps/web/app/pages/${page}.tsx`, pageComponent, artifacts);
        }

        // Generate auth context
        const authContext = generateAuthContext();
        await writeFile(workspacePath, 'apps/web/context/AuthContext.tsx', authContext, artifacts);

        // Generate protected route component
        const protectedRoute = generateProtectedRoute();
        await writeFile(workspacePath, 'apps/web/components/protected-route.tsx', protectedRoute, artifacts);

        // Generate API client
        const apiClient = generateApiClient();
        await writeFile(workspacePath, 'apps/web/lib/api-client.ts', apiClient, artifacts);

        // Generate Tailwind config
        const tailwindConfig = generateTailwindConfig();
        await writeFile(workspacePath, 'tailwind.config.ts', tailwindConfig, artifacts);

        costCredits = 20;
        break;
      }

      case 'implement_dashboard': {
        const pages = (step.input.pages as string[]) ?? ['dashboard', 'settings', 'projects'];

        for (const page of pages) {
          const pageComponent = generateDashboardPage(page);
          await writeFile(workspacePath, `apps/web/app/pages/${page}.tsx`, pageComponent, artifacts);
        }

        // Generate sidebar component
        const sidebar = generateSidebar();
        await writeFile(workspacePath, 'apps/web/components/sidebar.tsx', sidebar, artifacts);

        // Generate main layout
        const layout = generateMainLayout();
        await writeFile(workspacePath, 'apps/web/components/layout.tsx', layout, artifacts);

        // Generate hook for data fetching
        const useData = generateDataHook();
        await writeFile(workspacePath, 'apps/web/hooks/use-data.ts', useData, artifacts);

        // Generate toast notifications
        const toast = generateToast();
        await writeFile(workspacePath, 'apps/web/components/ui/toast.tsx', toast, artifacts);

        costCredits = 25;
        break;
      }

      default:
        throw new Error(`Unknown frontend action: ${action}`);
    }

    return {
      output: { frontend: 'completed', pages: artifacts.map(a => a.name) },
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

// Page components
function generatePageComponent(page: string): string {
  if (page === 'login') {
    return `import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="max-w-md w-full space-y-4">
        <h2 className="text-2xl font-bold">Accedi</h2>
        <form className="space-y-4">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" />
          </div>
          <Button type="submit">Accedi</Button>
        </form>
      </div>
    </div>
  );
}`;
  }
  return `import Image from 'next/image';
import { Button } from '@/components/ui/button';

export default function ${page[0].toUpperCase() + page.slice(1)}Page() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <h2 className="text-2xl font-bold">${page[0].toUpperCase() + page.slice(1)}</h2>
    </div>
  );
}`;
}

function generateDashboardPage(page: string): string {
  if (page === 'dashboard') {
    return `import Sidebar from '@/components/sidebar';
import { useData } from '@/hooks/use-data';
import { Toast } from '@/components/ui/toast';

export default function DashboardPage() {
  const { data, isLoading, isError, fetch } = useData('/api/user/me');
  
  if (isLoading) return <p>Caricamento...</p>;
  if (isError) return <Toast type="error">Errore nel caricamento</Toast>;

  return (
    <div className="p-4">
      <Sidebar />
      <main className="ml-64 min-h-screen">
        <h1 className="text-3xl font-bold mb-4">Dashboard</h1>
        <div className="prose">
          {data && <div dangerouslySetInnerHTML={{ __html: data }} />}
        </div>
      </main>
    </div>
  );
}`;
  }
  return `import Sidebar from '@/components/sidebar';
export default function ${page[0].toUpperCase() + page.slice(1)}Page() {
  return (
    <div className="p-4">
      <h1 className="text-xl font-bold">${page[0].toUpperCase() + page.slice(1)}</h1>
    </div>
  );
}`;
}

function generateSidebar(): string {
  return `import { Menu } from 'lucide-react';

export function Sidebar() {
  return (
    <nav className="bg-gray-800 h-screen p-4 text-white">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold">Aethersy</h2>
      </div>
      <ul className="space-y-2">
        <li>
          <a href="/dashboard" className="block p-2 rounded hover:bg-gray-700">
            <Menu className="w-5 h-5" /> Dashboard
          </a>
        </li>
        <li>
          <a href="/projects" className="block p-2 rounded hover:bg-gray-700">
            <Menu className="w-5 h-5" /> Progetti
          </a>
        </li>
        <li>
          <a href="/settings" className="block p-2 rounded hover:bg-gray-700">
            <Menu className="w-5 h-5" /> Impostazioni
          </a>
        </li>
      </ul>
    </nav>
  );
}`;
}

function generateMainLayout(): string {
  return `import Image from 'next/image';
import { useData } from '@/hooks/use-data';
import { Sidebar } from '@/components/sidebar';
import { Toast } from '@/components/ui/toast';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const { isLoading } = useData('/api/user/me');

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center">Caricamento...</div>;
  }

  return (
    <div className="min-h-screen">
      <Sidebar />
      <main className="ml-64 p-6 flex-1 bg-gray-100 min-h-screen">
        {children}
      </main>
    </div>
  );
}`;
}
