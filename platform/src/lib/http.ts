// =============================================================================
// Client HTTP reale verso il BFF Console.
//
// In produzione la SPA e il BFF condividono la stessa origine (Caddy inoltra
// `/api/*` al container `console`), quindi basta `credentials: "include"` per
// portare il cookie di sessione httpOnly. In sviluppo Vite proxa `/api` verso
// il BFF locale (vedi vite.config.ts), cosi' lo stesso codice funziona in
// entrambi gli ambienti.
//
// Nessun token vive in localStorage: l'autenticazione e' interamente nel cookie.
// =============================================================================

/** Base delle API. Vuoto = stessa origine (default in produzione e dev). */
const API_BASE = (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "");

export class HttpError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.name = "HttpError";
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
  query?: Record<string, string | number | boolean | undefined | null>;
}

function buildUrl(path: string, query?: RequestOptions["query"]): string {
  const url = `${API_BASE}${path}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

/**
 * Esegue una richiesta al BFF. Lancia `HttpError` con status/codice per far
 * reagire i layer superiori (es. redirect a /login su 401).
 */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const res = await fetch(buildUrl(path, options.query), {
    method: options.method ?? "GET",
    credentials: "include",
    headers: options.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
  });

  const text = await res.text();
  const data = text ? safeJson(text) : null;

  if (!res.ok) {
    // 401 = il BFF non riconosce la sessione (cookie scaduto, non inviato o
    // doppione). Non si butta fuori l'utente: si restituisce un messaggio
    // comprensibile. Il redirect al login e' compito della guardia di rotta,
    // che al prossimo reload controlla davvero la sessione.
    if (res.status === 401) {
      const message = String(
        (data && (data.message ?? data.error)) || "Sessione non valida: accedi di nuovo.",
      );
      throw new HttpError(
        401,
        message === "Identita' tenant non valida"
          ? "Sessione non valida: accedi di nuovo."
          : message,
        data?.code,
      );
    }
    const message =
      (data && (data.message ?? data.error)) || res.statusText || `Errore HTTP ${res.status}`;
    throw new HttpError(res.status, String(message), data?.code);
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

export const http = {
  get: <T>(path: string, query?: RequestOptions["query"], signal?: AbortSignal) =>
    request<T>(path, { method: "GET", query, signal }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: "POST", body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: "PATCH", body }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};
