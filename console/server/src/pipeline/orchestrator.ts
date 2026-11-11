import {
  createRun,
  deliverRunAssets,
  finishTask,
  getRun,
  listTasks,
  makeFlowRunId,
  recordFlowRun,
  registerAsset,
  startTask,
  syncRunStatus,
  transitionAsset,
  transitionRun,
  type AgentTaskRow,
  type PipelineRunRow,
} from "./repo.js";
import { stageSpec, type StageId, type StageSpec } from "./catalog.js";

// Orchestratore della pipeline (P0.3): fa avanzare un run di stadio attraverso
// i suoi task, in ordine, registrando per ciascuno il consumo di orchestrazione
// (`flow_run`) e, se l'esecutore lo produce, i deliverable.
//
// L'esecutore e' INIETTATO: l'orchestratore non parla con Activepieces ne' con
// i provider AI. Cosi' la stessa logica di stato/metering vale sia in
// produzione (executor che accoda un flow Activepieces) sia nei test (executor
// deterministico). Vedi docs/platform-consumption.md sez. 2 e 5.
//
// Riferimento di stato: `catalog.ts` e' la fonte unica delle transizioni
// ammesse; qui non si inventa nessuno stato.

/** Deliverable prodotto da un task (metadati; il contenuto sta su storage). */
export interface TaskAsset {
  kind: "document" | "image" | "video" | "audio" | "code" | "link" | "dataset" | "archive";
  name: string;
  storageKey: string;
  mime?: string | null;
  sizeBytes?: number | null;
  meta?: unknown;
}

export interface TaskExecutionResult {
  status?: "done" | "failed" | "skipped";
  output?: unknown;
  error?: string | null;
  assets?: TaskAsset[];
  /**
   * `true` se l'esecutore "propone" i deliverable: gli asset vengono sottoposti
   * a revisione umana (`in_review`) subito dopo la registrazione. Default `false`
   * (l'asset resta `draft`, in attesa di sottomissione esplicita).
   */
  submit?: boolean;
}

export interface TaskContext {
  tenantId: string;
  run: PipelineRunRow;
  stage: StageSpec;
  task: AgentTaskRow;
  /** Id del flow run Activepieces attribuito al task (per il metering AI). */
  flowRunId: string;
  brief: unknown;
  context: unknown;
}

/** Esegue un task. Non deve lanciare per errori "attesi": usi `status: 'failed'`. */
export type TaskExecutor = (ctx: TaskContext) => Promise<TaskExecutionResult>;

export interface OrchestrateOptions {
  /** Se `false` non viene registrato il consumo `flow_run` del task (dry-run). */
  meter?: boolean;
  /** Esegue i task in sequenza ma non si ferma al primo fallimento. */
  continueOnError?: boolean;
  /**
   * Esegue SOLO i task di questo specialista (droid). Serve al comando
   * "avvia lo specialista X": gli altri reparti dello stadio restano in
   * attesa, lanciati esplicitamente o dalla chat.
   */
  onlyDroid?: string;
}

export interface TaskOutcome {
  taskId: string;
  seq: number;
  droid: string;
  status: string;
  flowRunId: string;
  credits: number;
  assets: number;
  error: string | null;
}

export interface OrchestrateResult {
  run: PipelineRunRow | null;
  outcomes: TaskOutcome[];
  credits: number;
  failed: boolean;
}

/** Apre un run per lo stadio, con i task pianificati dal catalogo. */
export async function openRun(input: {
  tenantId: string;
  stage: StageId;
  title?: string;
  brief?: unknown;
  context?: unknown;
}): Promise<PipelineRunRow> {
  const spec = stageSpec(input.stage);
  if (!spec) throw new Error(`stadio sconosciuto: ${input.stage}`);
  return createRun(
    { tenantId: input.tenantId, stage: input.stage, title: input.title, brief: input.brief, context: input.context },
    spec,
  );
}

/**
 * Esegue tutti i task pendenti/falliti di un run, in ordine di `seq`.
 * Per ogni task: `pending -> running -> done|failed`, poi registra il consumo
 * di orchestrazione. A fine giro riallinea lo stato del run dai task
 * (`in_progress` / `in_review` / `failed`).
 */
export async function orchestrateRun(
  tenantId: string,
  runId: string,
  executor: TaskExecutor,
  opts: OrchestrateOptions = {},
): Promise<OrchestrateResult> {
  const meter = opts.meter ?? true;
  const outcomes: TaskOutcome[] = [];

  let run = await getRun(tenantId, runId);
  if (!run) return { run: null, outcomes, credits: 0, failed: false };

  const spec = stageSpec(run.stage);
  if (!spec) throw new Error(`stadio sconosciuto nel run: ${run.stage}`);

  // draft -> in_progress (idempotente: se gia' oltre, non si torna indietro).
  if (run.status === "draft" || run.status === "failed") {
    run = (await transitionRun(tenantId, runId, "in_progress")) ?? run;
  }

  const tasks = await listTasks(tenantId, runId);
  const pending = tasks.filter(
    (t) =>
      (t.status === "pending" || t.status === "failed") &&
      (!opts.onlyDroid || t.droid === opts.onlyDroid),
  );

  let totalCredits = 0;
  let failed = false;

  for (const task of pending) {
    const flowRunId = task.flow_run_id ?? makeFlowRunId(run.stage, runId, task.seq);
    const started = await startTask(tenantId, task.id, flowRunId);
    if (!started) continue; // gia' in esecuzione o concluso da un altro giro

    let result: TaskExecutionResult;
    let credits = 0;
    try {
      result = await executor({
        tenantId,
        run,
        stage: spec,
        task: started,
        flowRunId,
        brief: run.brief,
        context: run.context,
      });
    } catch (err) {
      result = { status: "failed", error: (err as Error).message };
    }

    // Consumo di orchestrazione: 1 task eseguito = 1 `request`.
    if (meter) {
      try {
        const settled = await recordFlowRun({
          tenantId,
          runId,
          taskId: task.id,
          flowRunId,
          status: result.status === "failed" ? "error" : "success",
        });
        credits = settled.credits;
        totalCredits += settled.credits;
      } catch (err) {
        // Il metering dell'orchestrazione non deve interrompere il lavoro, ma
        // l'anomalia va resa visibile (task concluso senza addebito).
        // eslint-disable-next-line no-console
        console.error(`[pipeline] recordFlowRun ${flowRunId}: ${(err as Error).message}`);
      }
    }

    const finished = await finishTask(tenantId, task.id, {
      output: result.output,
      status: result.status ?? (result.error ? "failed" : "done"),
      error: result.error ?? null,
    });

    // Deliverable: registrati solo se il task e' andato a buon fine.
    // L'esecutore puo' dichiarare il deliverable come "proposto" (`submit`): in
    // tal caso nasce `draft` e passa subito a `in_review`, cosi' e' decidibile
    // (approva/rifiuta) dal cliente. Gli esecutori che non lo dichiarano
    // lasciano l'asset `draft`, in attesa di sottomissione esplicita.
    let assets = 0;
    if (finished && finished.status === "done" && result.assets?.length) {
      for (const a of result.assets) {
        const asset = await registerAsset({
          tenantId,
          runId,
          taskId: task.id,
          kind: a.kind,
          name: a.name,
          storageKey: a.storageKey,
          mime: a.mime ?? null,
          sizeBytes: a.sizeBytes ?? null,
          meta: a.meta ?? {},
        });
        if (result.submit) {
          await transitionAsset(tenantId, asset.id, "in_review", { by: task.droid });
        }
        assets += 1;
      }
    }

    if (finished?.status === "failed") failed = true;

    outcomes.push({
      taskId: task.id,
      seq: task.seq,
      droid: task.droid,
      status: finished?.status ?? "unknown",
      flowRunId,
      credits,
      assets,
      error: finished?.error ?? result.error ?? null,
    });

    if (failed && !opts.continueOnError) break;
  }

  const synced = await syncRunStatus(tenantId, runId);
  return { run: synced ?? run, outcomes, credits: totalCredits, failed };
}

/** Approva un run in `in_review` (HITL: nessuna pubblicazione senza approvazione). */
export async function approveRun(
  tenantId: string,
  runId: string,
  approvedBy: string,
): Promise<PipelineRunRow | null> {
  return transitionRun(tenantId, runId, "approved", { approvedBy });
}

/** Consegna un run approvato e marca `delivered` i suoi asset approvati. */
export async function deliverRun(tenantId: string, runId: string): Promise<PipelineRunRow | null> {
  const run = await transitionRun(tenantId, runId, "delivered");
  if (!run) return null;
  await deliverRunAssets(tenantId, runId);
  return run;
}

/** Riporta un run fallito in lavorazione (retry dopo fix). */
export async function retryRun(tenantId: string, runId: string): Promise<PipelineRunRow | null> {
  return transitionRun(tenantId, runId, "in_progress");
}
