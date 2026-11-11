// pipeline/metered-chat.ts — chiamata di testo metrata, riusabile.
//
// Ogni chiamata AI della piattaforma prenota i crediti, esegue e salda il
// consumo in base ai token effettivi; in caso di errore rilascia la
// prenotazione (nessun addebito). Vive in un modulo per essere usato sia
// dall'esecutore dei task sia dai builder che chiamano l'AI fuori pipeline.

import crypto from "node:crypto";
import { chat } from "../ai-router.js";
import {
  estimateCredits,
  releaseReservation,
  reserveCredits,
  type TenantContext,
} from "../metering/repo.js";

export interface MeteredChatOptions {
  tenant: TenantContext;
  prompt: string;
  /** Modello richiesto esplicitamente (es. "perplexity/sonar"). */
  model?: string;
  /** true = preferisce i modelli gratuiti (default del router). */
  preferFree?: boolean;
  requestId?: string;
  flowRunId?: string | null;
  /** Suffisso per distinguere piu' addebiti nella stessa richiesta. */
  suffix?: string;
}

export interface MeteredChatResult {
  answer: string;
  model: string;
  credits: number;
}

export async function meteredText(options: MeteredChatOptions): Promise<MeteredChatResult> {
  const requestId =
    options.requestId ?? `chat:${options.suffix ?? "free"}:${crypto.randomUUID().slice(0, 8)}`;
  const estimate = Math.max(1, Math.ceil(options.prompt.length / 4));

  const priced = await estimateCredits(options.tenant, {
    capability: "text",
    model: "*",
    provider: "openrouter",
    units: ["token_in", "token_out"],
    counts: { token_in: estimate, token_out: estimate },
  });

  const reservation = await reserveCredits(options.tenant.tenantId, requestId, priced);
  const reserved = reservation.ok ? reservation.reserved : 0;

  try {
    const result = await chat({
      capability: "text",
      prompt: options.prompt,
      model: options.model,
      preferFree: options.preferFree ?? true,
      meter: {
        tenant: options.tenant,
        requestId,
        reservation: reserved,
        flowRunId: options.flowRunId ?? null,
        degraded: false,
      },
    });
    return {
      answer: result.answer,
      model: result.model,
      credits: result.billing?.credits ?? 0,
    };
  } catch (err) {
    await releaseReservation(
      options.tenant.tenantId,
      requestId,
      reserved,
      `chat failed: ${(err as Error).message}`,
    ).catch(() => undefined);
    throw err;
  }
}
