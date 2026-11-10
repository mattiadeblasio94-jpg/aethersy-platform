import { config } from "./config.js";

// Proxy server-side verso le API Activepieces. Il token dell'utente (in sessione)
// viene inoltrato come `Authorization: Bearer`; nessuna chiave e' mai esposta al
// browser. Il BFF normalizza le risposte per il frontend.

export class ApError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function apFetch<T>(
  path: string,
  init: RequestInit & { token?: string } = {},
): Promise<T> {
  const { token, headers, ...rest } = init;
  const res = await fetch(`${config.apUrl}${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(headers ?? {}),
    },
  });

  const text = await res.text();
  const data = text ? safeJson(text) : null;

  if (!res.ok) {
    const message = data?.message ?? data?.params?.message ?? data?.error ?? res.statusText;
    throw new ApError(res.status, String(message), data?.code);
  }
  return data as T;
}

function safeJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

// --- Adapter: forma delle risposte Activepieces -> forma attesa dal frontend --

/**
 * Activepieces (>= 0.92) risponde alle liste con un envelope `{ data: [...] }`,
 * mentre le rotte BFF e il frontend si aspettano un array. La funzione
 * normalizza entrambe le forme: senza questo passaggio `/api/ap/flows` (e le
 * altre liste) crashano con "flows.map is not a function".
 */
export function apList<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (payload && typeof payload === "object") {
    const data = (payload as { data?: unknown }).data;
    if (Array.isArray(data)) return data as T[];
  }
  return [];
}

interface ApFlow {
  id: string;
  displayName?: string;
  projectId: string;
  status?: string;
  publishedVersionId?: string | null;
  created?: string;
  updated?: string;
}

export interface FlowView {
  id: string;
  displayName: string;
  projectId: string;
  status: string;
  publishedVersionId?: string | null;
  created?: string;
  updated?: string;
}

export function toFlowView(f: ApFlow): FlowView {
  return {
    id: f.id,
    displayName: f.displayName ?? "(senza nome)",
    projectId: f.projectId,
    status: f.status ?? "DISABLED",
    publishedVersionId: f.publishedVersionId ?? null,
    created: f.created,
    updated: f.updated,
  };
}

export interface RunView {
  id: string;
  flowId: string;
  flowDisplayName?: string;
  projectId: string;
  status: string;
  startTime?: string;
  finishTime?: string | null;
  environment?: string;
}

export function toRunView(r: any, flowNames: Map<string, string>): RunView {
  return {
    id: r.id,
    flowId: r.flowId,
    flowDisplayName: flowNames.get(r.flowId),
    projectId: r.projectId,
    status: r.status,
    startTime: r.startTime,
    finishTime: r.finishTime ?? null,
    environment: r.environment,
  };
}
