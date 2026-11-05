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

function generateAuthContext(): string {
  return `'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';

export interface AuthUser {
  id: string;
  email: string;
  name?: string;
}

export interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  logout: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setUser(data?.user ?? null))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
    window.location.href = '/login';
  }

  return (
    <AuthContext.Provider value={{ user, loading, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
`;
}

function generateProtectedRoute(): string {
  return `'use client';

import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useAuth } from '@/context/AuthContext';

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  if (loading) {
    return <div className="p-8 text-center text-gray-500">Caricamento...</div>;
  }

  if (!user) {
    router.replace('/login');
    return null;
  }

  return <>{children}</>;
}
`;
}

function generateApiClient(): string {
  return `// lib/api-client.ts — client HTTP tipizzato con refresh automatico del token
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(\`\${API_BASE}\${path}\`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
    credentials: 'include',
  });

  if (!response.ok) {
    const text = await response.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      // risposta non JSON: si tiene il testo grezzo
    }
    throw new ApiError(response.status, \`Request failed: \${response.status}\`, body);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'POST', body: data ? JSON.stringify(data) : undefined }),
  patch: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'PATCH', body: data ? JSON.stringify(data) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
`;
}

function generateTailwindConfig(): string {
  return `import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './apps/web/app/**/*.{ts,tsx}',
    './apps/web/components/**/*.{ts,tsx}',
    './apps/web/hooks/**/*.{ts,tsx}',
    './packages/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          main: '#1A1A2E',
          light: '#16213E',
          dark: '#0F0F23',
        },
      },
    },
  },
  plugins: [],
};

export default config;
`;
}

function generateDataHook(): string {
  return `'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api-client';

export interface UseDataResult<T> {
  data: T | null;
  error: Error | null;
  isLoading: boolean;
  refetch: () => Promise<void>;
}

export function useData<T>(path: string): UseDataResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await api.get<T>(path);
      setData(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, [path]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { data, error, isLoading, refetch };
}
`;
}

function generateToast(): string {
  return `'use client';

import { createContext, useCallback, useContext, useState } from 'react';
import type { ReactNode } from 'react';

export interface ToastMessage {
  id: number;
  title: string;
  description?: string;
  variant?: 'default' | 'success' | 'error';
}

interface ToastContextValue {
  toast: (message: Omit<ToastMessage, 'id'>) => void;
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<ToastMessage[]>([]);

  const toast = useCallback((message: Omit<ToastMessage, 'id'>) => {
    const id = Date.now();
    setMessages((current) => [...current, { ...message, id }]);
    setTimeout(() => {
      setMessages((current) => current.filter((m) => m.id !== id));
    }, 5000);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {messages.map((message) => (
          <div
            key={message.id}
            className={\`rounded-lg border px-4 py-3 shadow-lg bg-white text-sm \${
              message.variant === 'error' ? 'border-red-300' : 'border-gray-200'
            }\`}
          >
            <p className="font-medium">{message.title}</p>
            {message.description ? (
              <p className="text-gray-500">{message.description}</p>
            ) : null}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  return useContext(ToastContext);
}
`;
}
