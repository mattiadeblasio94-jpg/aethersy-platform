// =============================================================================
// Rendering dei deliverable in PDF in un thread separato.
//
// Il 09/11/2026 un marcatore markdown isolato ("5*3") ha fatto entrare il
// parser in loop infinito: il rendering girava sul thread principale del BFF e
// bloccava l'event loop, rendendo '/api/*' irraggiungibile per tutti gli
// utenti (la SPA statica continuava a rispondere, quindi il sintomo era
// "la piattaforma si carica ma non si collega").
//
// Qui il rendering viene eseguito in un worker thread: anche un input patologico
// non puo' piu' bloccare il server. Il worker viene terminato se supera il
// timeout e il chiamante riceve un errore invece di un hang.
// =============================================================================

import { Worker } from "node:worker_threads";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { PdfOptions } from "./pdf-render.js";

export type { PdfAttachment, PdfOptions } from "./pdf-render.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER_PATH = join(HERE, "pdf-worker.js");

/** Timeout massimo per un singolo rendering. */
const RENDER_TIMEOUT_MS = 30_000;

/**
 * Genera il PDF del deliverable in un worker isolato.
 * Non blocca mai il thread principale: in caso di timeout il worker viene
 * terminato e la promise viene rifiutata.
 */
export async function renderDeliverablePdf(options: PdfOptions): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    let settled = false;
    let worker: Worker;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };

    const timer = setTimeout(() => {
      finish(() => {
        void worker.terminate();
        reject(new Error(`rendering PDF superato il timeout di ${RENDER_TIMEOUT_MS} ms`));
      });
    }, RENDER_TIMEOUT_MS);

    try {
      worker = new Worker(WORKER_PATH, {
        workerData: options,
        resourceLimits: { maxOldGenerationSizeMb: 256 },
      });
    } catch (err) {
      finish(() => reject(err instanceof Error ? err : new Error(String(err))));
      return;
    }

    worker.on("message", (msg: { ok?: boolean; bytes?: Buffer; error?: string }) => {
      if (msg?.ok && msg.bytes) {
        finish(() => {
          void worker.terminate();
          resolve(Buffer.from(msg.bytes as Buffer));
        });
        return;
      }
      finish(() => {
        void worker.terminate();
        reject(new Error(msg?.error ?? "rendering PDF fallito"));
      });
    });

    worker.on("error", (err) => {
      finish(() => reject(err instanceof Error ? err : new Error(String(err))));
    });

    worker.on("exit", (code) => {
      if (settled) return;
      finish(() => reject(new Error(`worker PDF terminato con codice ${code}`)));
    });
  });
}
