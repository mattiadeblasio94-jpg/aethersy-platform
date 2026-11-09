// Worker thread dedicato al rendering dei deliverable in PDF.
//
// Riceve le opzioni del documento in `workerData`, esegue il renderer e
// restituisce i byte del PDF al thread principale. Vedi `pdf.ts`.
// =============================================================================

import { parentPort, workerData } from "node:worker_threads";
import { renderDeliverablePdf } from "./pdf-render.js";

async function main() {
  const port = parentPort;
  if (!port) return;
  try {
    const bytes = await renderDeliverablePdf(workerData as Parameters<typeof renderDeliverablePdf>[0]);
    port.postMessage({ ok: true, bytes });
  } catch (err) {
    port.postMessage({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
}

void main();
