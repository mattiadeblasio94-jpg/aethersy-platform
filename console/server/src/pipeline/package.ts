import { getRun, listAssets, runUsageSummary, type AssetRow, type PipelineRunRow, type RunUsageSummary } from "./repo.js";

// Pacchetto consegnabile di un run (P0.6): manifest JSON con i soli deliverable
// approvati/consegnati (metadati + storage key) e il consumo aggregato.
//
// Vive in un modulo dedicato (non dentro la rotta) perche' e' la stessa logica
// che il test E2E della pipeline deve poter verificare senza HTTP: rotta e test
// condividono un'unica implementazione.
//
// Nessun binario viene incluso: i `storageKey` puntano allo storage esterno.

export const RUN_PACKAGE_FORMAT = "aethersy.run-package/v1";

export interface RunPackage {
  format: typeof RUN_PACKAGE_FORMAT;
  generatedAt: string;
  run: {
    id: string;
    stage: string;
    title: string;
    status: PipelineRunRow["status"];
    approvedBy: string | null;
    approvedAt: Date | null;
    deliveredAt: Date | null;
  };
  deliverables: Array<{
    name: string;
    kind: string;
    version: number;
    status: string;
    storageKey: string;
    mime: string | null;
    sizeBytes: string | null;
    meta: unknown;
  }>;
  usage: RunUsageSummary["totals"] & { byCapability: RunUsageSummary["byCapability"] };
}

/** Vero se un asset entra nel pacchetto (approvato o gia' consegnato). */
export function isPackagedAsset(asset: Pick<AssetRow, "status">): boolean {
  return asset.status === "approved" || asset.status === "delivered";
}

/**
 * Costruisce il pacchetto di un run. Ritorna `null` se il run non esiste o non
 * appartiene al tenant: la rotta risponde 404, il test asserisce l'assenza.
 */
export async function buildRunPackage(tenantId: string, runId: string): Promise<RunPackage | null> {
  const run = await getRun(tenantId, runId);
  if (!run) return null;

  const [assets, usage] = await Promise.all([
    listAssets(tenantId, { runId }),
    runUsageSummary(tenantId, runId),
  ]);

  return {
    format: RUN_PACKAGE_FORMAT,
    generatedAt: new Date().toISOString(),
    run: {
      id: run.id,
      stage: run.stage,
      title: run.title,
      status: run.status,
      approvedBy: run.approved_by,
      approvedAt: run.approved_at,
      deliveredAt: run.delivered_at,
    },
    deliverables: assets.filter(isPackagedAsset).map((a) => ({
      name: a.name,
      kind: a.kind,
      version: a.version,
      status: a.status,
      storageKey: a.storage_key,
      mime: a.mime,
      sizeBytes: a.size_bytes,
      meta: a.meta,
    })),
    usage: { ...usage.totals, byCapability: usage.byCapability },
  };
}

/** Nome file dell'allegato: stabile e senza caratteri da sanitizzare. */
export function runPackageFilename(run: Pick<PipelineRunRow, "id" | "stage">): string {
  return `run-${run.stage}-${run.id.slice(0, 8)}.json`;
}
