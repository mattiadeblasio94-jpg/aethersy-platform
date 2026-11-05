// telegram.ts — Notifiche operative del builder (Slack).
//
// Il builder (Universal Builder Platform) avvisa su Slack quando un task viene
// creato, avviato, completato o fallisce, quando il saldo crediti e' basso,
// quando un deploy va a buon fine e con il riepilogo giornaliero.
//
// Il webhook si legge da `SLACK_WEBHOOK_URL` (vedi `.env` del VPS). Se la
// variabile non e' impostata il modulo resta silenzioso: le notifiche non
// devono mai far fallire una rotta API, quindi gli errori di rete vengono
// solo loggati.

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;

export interface TaskNotification {
  id: string;
  title: string;
  type?: string;
  projectName?: string;
  estimatedCredits?: number;
  costCredits?: number;
  artifacts?: { kind: string; name: string }[];
  error?: string;
  willRetry?: boolean;
}

export interface LowBalanceNotification {
  balance: number;
  threshold?: number;
  tenantName?: string;
}

export interface DeployNotification {
  name: string;
  type?: string;
  urls?: string[];
}

export interface DailySummaryNotification {
  date: string;
  tasksCompleted: number;
  tasksFailed: number;
  totalCreditsUsed: number;
  balance?: number;
  projectsActive?: number;
}

async function post(text: string, blocks?: unknown[]): Promise<void> {
  if (!SLACK_WEBHOOK_URL) return;

  try {
    const response = await fetch(SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(blocks ? { text, blocks } : { text }),
    });
    if (!response.ok) {
      console.warn(`[telegram] Slack ha risposto ${response.status}`);
    }
  } catch (err) {
    console.warn(`[telegram] notifica Slack non inviata: ${String(err)}`);
  }
}

function taskLine(task: TaskNotification): string {
  const parts = [`*${task.title}*`];
  if (task.type) parts.push(`tipo: ${task.type}`);
  if (task.projectName) parts.push(`progetto: ${task.projectName}`);
  if (task.estimatedCredits !== undefined) parts.push(`crediti stimati: ${task.estimatedCredits}`);
  if (task.costCredits !== undefined) parts.push(`crediti usati: ${task.costCredits}`);
  return `${parts.join(" | ")} — \`${task.id}\``;
}

export async function notifyTaskCreated(task: TaskNotification): Promise<void> {
  await post(`Nuovo task builder: ${taskLine(task)}`);
}

export async function notifyTaskStarted(task: TaskNotification): Promise<void> {
  await post(`Task builder avviato: ${taskLine(task)}`);
}

export async function notifyTaskCompleted(task: TaskNotification): Promise<void> {
  const artifacts = task.artifacts?.length ? ` | artefatti: ${task.artifacts.length}` : "";
  await post(`Task builder completato: ${taskLine(task)}${artifacts}`);
}

export async function notifyTaskFailed(task: TaskNotification): Promise<void> {
  const retry = task.willRetry ? " (verra' ritentato)" : "";
  await post(
    `Task builder FALLITO${retry}: ${taskLine(task)}` +
      (task.error ? `\nErrore: ${task.error}` : ""),
  );
}

export async function notifyLowBalance(notification: LowBalanceNotification): Promise<void> {
  const threshold = notification.threshold ?? 10;
  const tenant = notification.tenantName ? ` | tenant: ${notification.tenantName}` : "";
  await post(`Saldo crediti basso: ${notification.balance}${tenant} (soglia ${threshold})`);
}

export async function notifyProjectDeployed(deploy: DeployNotification): Promise<void> {
  const urls = deploy.urls?.length ? ` | url: ${deploy.urls.join(", ")}` : "";
  await post(`Deploy completato: *${deploy.name}*${deploy.type ? ` (${deploy.type})` : ""}${urls}`);
}

export async function notifyDailySummary(summary: DailySummaryNotification): Promise<void> {
  const balance = summary.balance !== undefined ? ` | saldo: ${summary.balance}` : "";
  const projects = summary.projectsActive !== undefined ? ` | progetti attivi: ${summary.projectsActive}` : "";
  await post(
    `Riepilogo builder ${summary.date}: completati ${summary.tasksCompleted} | falliti ${summary.tasksFailed}` +
      ` | crediti usati ${summary.totalCreditsUsed}${balance}${projects}`,
  );
}
