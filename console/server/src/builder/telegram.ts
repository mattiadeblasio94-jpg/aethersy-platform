// builder/telegram.ts — Telegram bot integration for task notifications

import { config } from "../config.js";
import { db } from "../metering/db.js";

export interface TelegramConfig {
  botToken: string;
  chatId: string; // Can be user ID, group ID, or channel username (@channel)
  enabled: boolean;
}

// Telegram config from env (add to .env)
function getTelegramConfig(): TelegramConfig {
  const botToken = process.env.TELEGRAM_BOT_TOKEN ?? "";
  const chatId = process.env.TELEGRAM_CHAT_ID ?? "";
  return {
    botToken,
    chatId,
    enabled: Boolean(botToken && chatId),
  };
}

const TELEGRAM_API = "https://api.telegram.org/bot";

/** Send a message via Telegram Bot API */
export async function sendTelegramMessage(text: string, options: { parse_mode?: 'HTML' | 'Markdown'; disable_web_page_preview?: boolean } = {}): Promise<{ ok: boolean; error?: string }> {
  const cfg = getTelegramConfig();
  if (!cfg.enabled) return { ok: false, error: 'Telegram not configured' };

  try {
    const res = await fetch(`${TELEGRAM_API}${cfg.botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: cfg.chatId,
        text,
        parse_mode: options.parse_mode ?? 'HTML',
        disable_web_page_preview: options.disable_web_page_preview ?? true,
      }),
    });

    const data = await res.json();
    if (!data.ok) {
      return { ok: false, error: data.description };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

/** Send a message with inline keyboard (buttons) */
export async function sendTelegramWithButtons(
  text: string,
  buttons: Array<{ text: string; callback_data?: string; url?: string }>,
  options: { parse_mode?: 'HTML' | 'Markdown' } = {}
): Promise<{ ok: boolean; error?: string }> {
  const cfg = getTelegramConfig();
  if (!cfg.enabled) return { ok: false, error: 'Telegram not configured' };

  const inline_keyboard = buttons.map(b => [{
    text: b.text,
    ...(b.callback_data ? { callback_data: b.callback_data } : {}),
    ...(b.url ? { url: b.url } : {}),
  }]);

  try {
    const res = await fetch(`${TELEGRAM_API}${cfg.botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: cfg.chatId,
        text,
        parse_mode: options.parse_mode ?? 'HTML',
        reply_markup: { inline_keyboard },
      }),
    });

    const data = await res.json();
    if (!data.ok) return { ok: false, error: data.description };
    return { ok: true };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

/** Edit a previously sent message */
export async function editTelegramMessage(messageId: number, text: string, options: { parse_mode?: 'HTML' | 'Markdown' } = {}): Promise<{ ok: boolean; error?: string }> {
  const cfg = getTelegramConfig();
  if (!cfg.enabled) return { ok: false, error: 'Telegram not configured' };

  try {
    const res = await fetch(`${TELEGRAM_API}${cfg.botToken}/editMessageText`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: cfg.chatId,
        message_id: messageId,
        text,
        parse_mode: options.parse_mode ?? 'HTML',
      }),
    });

    const data = await res.json();
    if (!data.ok) return { ok: false, error: data.description };
    return { ok: true };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

/** Get bot info (for testing) */
export async function getTelegramBotInfo(): Promise<{ ok: boolean; username?: string; error?: string }> {
  const cfg = getTelegramConfig();
  if (!cfg.enabled) return { ok: false, error: 'Telegram not configured' };

  try {
    const res = await fetch(`${TELEGRAM_API}${cfg.botToken}/getMe`);
    const data = await res.json();
    if (!data.ok) return { ok: false, error: data.description };
    return { ok: true, username: data.result.username };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

// ============ TASK NOTIFICATION HELPERS ============

/** Format task status for Telegram */
export function formatTaskStatus(task: {
  id: string;
  title: string;
  type: string;
  status: string;
  projectName?: string;
  costCredits?: number;
  error?: string;
}): string {
  const statusEmoji: Record<string, string> = {
    pending: '⏳',
    running: '🔄',
    paused: '⏸',
    completed: '✅',
    failed: '❌',
    cancelled: '🚫',
  };

  const emoji = statusEmoji[task.status] ?? '❓';
  const lines = [
    `${emoji} <b>${task.title}</b>`,
    `Tipo: <code>${task.type}</code> | Stato: <b>${task.status}</b>`,
  ];

  if (task.projectName) lines.push(`Progetto: ${task.projectName}`);
  if (task.costCredits !== undefined) lines.push(`Costo: ${task.costCredits} crediti`);
  if (task.error) lines.push(`Errore: <code>${task.error}</code>`);
  lines.push(`ID: <code>${task.id.slice(0, 8)}</code>`);

  return lines.join('\n');
}

/** Notify task created/queued */
export async function notifyTaskCreated(task: {
  id: string;
  title: string;
  type: string;
  projectName?: string;
  estimatedCredits?: number;
}): Promise<void> {
  const text = [
    '📝 <b>Nuovo task in coda</b>',
    '',
    formatTaskStatus({ ...task, status: 'pending' }),
    task.estimatedCredits ? `\nStima crediti: ${task.estimatedCredits}` : '',
  ].filter(Boolean).join('\n');

  await sendTelegramMessage(text);
}

/** Notify task started */
export async function notifyTaskStarted(task: {
  id: string;
  title: string;
  type: string;
  projectName?: string;
}): Promise<void> {
  const text = [
    '🚀 <b>Task avviato</b>',
    '',
    formatTaskStatus({ ...task, status: 'running' }),
  ].join('\n');

  await sendTelegramMessage(text);
}

/** Notify task completed */
export async function notifyTaskCompleted(task: {
  id: string;
  title: string;
  type: string;
  projectName?: string;
  costCredits: number;
  artifacts?: Array<{ kind: string; name: string }>;
}): Promise<void> {
  const lines = [
    '✅ <b>Task completato</b>',
    '',
    formatTaskStatus({ ...task, status: 'completed', costCredits: task.costCredits }),
  ];

  if (task.artifacts && task.artifacts.length > 0) {
    lines.push('', '<b>Artifacts generati:</b>');
    for (const a of task.artifacts) {
      lines.push(`• ${a.kind}: ${a.name}`);
    }
  }

  await sendTelegramMessage(lines.join('\n'));
}

/** Notify task failed */
export async function notifyTaskFailed(task: {
  id: string;
  title: string;
  type: string;
  projectName?: string;
  error: string;
  willRetry: boolean;
}): Promise<void> {
  const text = [
    task.willRetry ? '🔄 <b>Task fallito (retry programmato)</b>' : '❌ <b>Task fallito definitivamente</b>',
    '',
    formatTaskStatus({ ...task, status: 'failed', error: task.error }),
    task.willRetry ? '\n⏳ Verrà ritentato automaticamente.' : '',
  ].filter(Boolean).join('\n');

  await sendTelegramMessage(text);
}

/** Notify credit balance low */
export async function notifyLowBalance(tenantId: string, balance: number, threshold = 50): Promise<void> {
  if (balance > threshold) return;

  const text = [
    '⚠️ <b>Saldo crediti basso</b>',
    '',
    `Tenant: <code>${tenantId.slice(0, 8)}</code>`,
    `Saldo attuale: <b>${balance} crediti</b>`,
    `Soglia: ${threshold} crediti`,
    '',
    'Ricarica da: <a href="https://console.aethersy.online/settings/billing">Console Billing</a>',
  ].join('\n');

  await sendTelegramMessage(text);
}

/** Notify project deployed */
export async function notifyProjectDeployed(project: {
  name: string;
  type: string;
  urls: Array<{ target: string; url: string }>;
}): Promise<void> {
  const lines = [
    '🌐 <b>Progetto deployato</b>',
    '',
    `<b>${project.name}</b> (${project.type})`,
    '',
    '<b>URLs:</b>',
  ];

  for (const u of project.urls) {
    lines.push(`• ${u.target}: <a href="${u.url}">${u.url}</a>`);
  }

  await sendTelegramMessage(lines.join('\n'));
}

/** Daily summary notification */
export async function notifyDailySummary(summary: {
  date: string;
  tasksCompleted: number;
  tasksFailed: number;
  totalCreditsUsed: number;
  balance: number;
  projectsActive: number;
}): Promise<void> {
  const text = [
    `📊 <b>Report giornaliero — ${summary.date}</b>`,
    '',
    `✅ Completati: ${summary.tasksCompleted}`,
    `❌ Falliti: ${summary.tasksFailed}`,
    `💰 Crediti usati: ${summary.totalCreditsUsed}`,
    `💳 Saldo: ${summary.balance}`,
    `📦 Progetti attivi: ${summary.projectsActive}`,
  ].join('\n');

  await sendTelegramMessage(text);
}
