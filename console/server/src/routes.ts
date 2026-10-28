import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { apFetch, ApError, toFlowView, toRunView } from "./ap.js";
import { config } from "./config.js";
import { clearSessionCookie, getSession, setSessionCookie, type Session } from "./session.js";

// Rotte BFF:
//   POST /api/auth/login     -> sign-in Activepieces, apre la sessione (cookie httpOnly)
//   POST /api/auth/logout    -> chiude la sessione
//   GET  /api/auth/session   -> utente corrente
//   GET  /api/ap/*           -> proxy autenticato verso Activepieces
//   GET  /api/ai/catalog     -> catalogo modelli per capacita' (AI Router)
//   POST /api/ai/chat        -> esecuzione multimodale via AI Router

function requireSession(request: FastifyRequest, reply: FastifyReply): Session | null {
  const session = getSession(request);
  if (!session) {
    reply.code(401).send({ code: "UNAUTHENTICATED", message: "Sessione non valida" });
    return null;
  }
  return session;
}

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  // ---------------------------------------------------------------- auth ----
  app.post("/api/auth/login", async (request, reply) => {
    const { email, password } = (request.body ?? {}) as { email?: string; password?: string };
    if (!email || !password) {
      return reply.code(400).send({ code: "BAD_REQUEST", message: "Email e password richiesti" });
    }

    let response: any;
    try {
      response = await apFetch<any>("/api/v1/authentication/sign-in", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
    } catch (err) {
      if (err instanceof ApError) {
        const status = err.code === "INVALID_CREDENTIALS" ? 401 : err.status;
        return reply.code(status).send({ code: err.code ?? "SIGN_IN_FAILED", message: err.message });
      }
      throw err;
    }

    if (!response?.token) {
      return reply.code(502).send({ code: "BAD_GATEWAY", message: "Risposta di sign-in inattesa" });
    }

    const session: Session = {
      token: response.token,
      user: {
        id: response.id,
        email: response.email,
        firstName: response.firstName,
        lastName: response.lastName,
        platformRole: response.platformRole,
        verified: response.verified,
        projectId: response.projectId ?? null,
      },
      exp: Math.floor(Date.now() / 1000) + config.cookieMaxAgeSec,
    };
    setSessionCookie(reply, session);
    return session.user;
  });

  app.post("/api/auth/logout", async (_request, reply) => {
    clearSessionCookie(reply);
    return { ok: true };
  });

  app.get("/api/auth/session", async (request, reply) => {
    const session = requireSession(request, reply);
    if (!session) return;
    return session.user;
  });

  // ------------------------------------------------- Activepieces proxy ----
  app.get("/api/ap/projects", async (request, reply) => {
    const session = requireSession(request, reply);
    if (!session) return;
    return apFetch<any[]>("/api/v1/projects", { token: session.token });
  });

  app.get("/api/ap/flows", async (request, reply) => {
    const session = requireSession(request, reply);
    if (!session) return;
    const { projectId } = request.query as { projectId?: string };
    if (!projectId) return reply.code(400).send({ code: "BAD_REQUEST", message: "projectId richiesto" });
    const flows = await apFetch<any[]>(`/api/v1/flows?projectId=${encodeURIComponent(projectId)}`, {
      token: session.token,
    });
    return flows.map(toFlowView);
  });

  app.post("/api/ap/flows", async (request, reply) => {
    const session = requireSession(request, reply);
    if (!session) return;
    const { projectId, displayName } = (request.body ?? {}) as {
      projectId?: string;
      displayName?: string;
    };
    if (!projectId || !displayName) {
      return reply.code(400).send({ code: "BAD_REQUEST", message: "projectId e displayName richiesti" });
    }
    const flow = await apFetch<any>("/api/v1/flows", {
      method: "POST",
      token: session.token,
      body: JSON.stringify({ projectId, displayName }),
    });
    return toFlowView(flow);
  });

  app.get("/api/ap/runs", async (request, reply) => {
    const session = requireSession(request, reply);
    if (!session) return;
    const { projectId } = request.query as { projectId?: string };
    if (!projectId) return reply.code(400).send({ code: "BAD_REQUEST", message: "projectId richiesto" });

    const [runs, flows] = await Promise.all([
      apFetch<any[]>(`/api/v1/flow-runs?projectId=${encodeURIComponent(projectId)}`, {
        token: session.token,
      }),
      apFetch<any[]>(`/api/v1/flows?projectId=${encodeURIComponent(projectId)}`, {
        token: session.token,
      }).catch(() => []),
    ]);
    const names = new Map<string, string>(flows.map((f) => [f.id, f.displayName ?? "(senza nome)"]));
    return runs.map((r) => toRunView(r, names));
  });

  app.get("/api/ap/runs/count", async (request, reply) => {
    const session = requireSession(request, reply);
    if (!session) return;
    const { projectId } = request.query as { projectId?: string };
    if (!projectId) return reply.code(400).send({ code: "BAD_REQUEST", message: "projectId richiesto" });
    return apFetch<any[]>(`/api/v1/flow-runs/count-by-status?projectId=${encodeURIComponent(projectId)}`, {
      token: session.token,
    }).catch(() => []);
  });

  app.get("/api/ap/connections", async (request, reply) => {
    const session = requireSession(request, reply);
    if (!session) return;
    const { projectId } = request.query as { projectId?: string };
    if (!projectId) return reply.code(400).send({ code: "BAD_REQUEST", message: "projectId richiesto" });
    const conns = await apFetch<any[]>(`/api/v1/app-connections?projectId=${encodeURIComponent(projectId)}`, {
      token: session.token,
    });
    return conns.map((c) => ({
      id: c.id,
      displayName: c.displayName,
      pieceName: c.pieceName,
      pieceDisplayName: c.pieceDisplayName,
      status: c.status,
      type: c.type,
    }));
  });

  // ------------------------------------------------------ AI Router -------
  app.get("/api/ai/catalog", async (request, reply) => {
    if (!requireSession(request, reply)) return;
    const { capability = "text" } = request.query as { capability?: string };
    const { catalogFor } = await import("./ai-router.js");
    return catalogFor(capability as any);
  });

  app.post("/api/ai/chat", async (request, reply) => {
    if (!requireSession(request, reply)) return;
    const body = (request.body ?? {}) as {
      capability?: string;
      prompt?: string;
      model?: string;
      preferFree?: boolean;
      fileUrl?: string;
    };
    if (!body.prompt) {
      return reply.code(400).send({ code: "BAD_REQUEST", message: "prompt richiesto" });
    }
    const { chat } = await import("./ai-router.js");
    try {
      return await chat({
        capability: (body.capability ?? "text") as any,
        prompt: body.prompt,
        model: body.model,
        preferFree: body.preferFree,
        fileUrl: body.fileUrl,
      });
    } catch (err) {
      return reply.code(502).send({ code: "AI_ERROR", message: (err as Error).message });
    }
  });
}
