// =============================================================================
// Utility condivise: classi CSS, formattazione date/numeri, costanti di stato.
// Funzioni pure, senza side effect, per essere testabili e riusabili.
// =============================================================================

const PLATFORM_LABELS: Record<string, string> = {
  instagram: "Instagram",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
  x: "X",
  facebook: "Facebook",
  youtube: "YouTube",
};

export function platformLabel(id: string): string {
  return PLATFORM_LABELS[id] ?? id;
}

const AGENT_TYPE_LABELS: Record<string, string> = {
  social: "Social",
  content: "Contenuti",
  outreach: "Outreach",
  analytics: "Analisi",
  web: "Sito Web",
  ads: "Annunci",
};

export function agentTypeLabel(type: string): string {
  return AGENT_TYPE_LABELS[type] ?? type;
}

const TASK_STATUS_LABELS: Record<string, string> = {
  pending: "In attesa",
  running: "In corso",
  completed: "Completato",
  failed: "Fallito",
  scheduled: "Programmato",
};

export function taskStatusLabel(status: string): string {
  return TASK_STATUS_LABELS[status] ?? status;
}

const TASK_TYPE_LABELS: Record<string, string> = {
  post: "Pubblicazione",
  content: "Contenuto",
  analysis: "Analisi",
  outreach: "Outreach",
  ads: "Annunci",
  report: "Report",
};

export function taskTypeLabel(type: string): string {
  return TASK_TYPE_LABELS[type] ?? type;
}

const POST_KIND_LABELS: Record<string, string> = {
  post: "Post",
  carousel: "Carosello",
  reel: "Reel",
  story: "Storia",
  video: "Video",
  article: "Articolo",
};

export function postKindLabel(kind: string): string {
  return POST_KIND_LABELS[kind] ?? kind;
}

const POST_STATUS_LABELS: Record<string, string> = {
  draft: "Bozza",
  published: "Pubblicato",
  scheduled: "Programmato",
};

export function postStatusLabel(status: string): string {
  return POST_STATUS_LABELS[status] ?? status;
}

const PRIORITY_LABELS: Record<string, string> = {
  low: "Bassa",
  medium: "Media",
  high: "Alta",
};

export function priorityLabel(priority: string): string {
  return PRIORITY_LABELS[priority] ?? priority;
}

const OUTREACH_CHANNEL_LABELS: Record<string, string> = {
  email: "Email",
  linkedin: "LinkedIn",
  twitter: "X / Twitter",
  phone: "Telefono",
};

export function outreachChannelLabel(channel: string): string {
  return OUTREACH_CHANNEL_LABELS[channel] ?? channel;
}

const LEAD_STATUS_LABELS: Record<string, string> = {
  new: "Nuovo",
  contacted: "Contattato",
  replied: "Ha risposto",
  interested: "Interessato",
  meeting: "Riunione",
  won: "Acquisito",
  lost: "Perso",
};

export function leadStatusLabel(status: string): string {
  return LEAD_STATUS_LABELS[status] ?? status;
}

const OUTREACH_STATUS_LABELS: Record<string, string> = {
  active: "Attiva",
  paused: "In pausa",
  completed: "Completata",
  draft: "Bozza",
};

export function outreachStatusLabel(status: string): string {
  return OUTREACH_STATUS_LABELS[status] ?? status;
}

const SITE_PAGE_STATUS_LABELS: Record<string, string> = {
  published: "Pubblicata",
  draft: "Bozza",
  review: "In revisione",
};

export function sitePageStatusLabel(status: string): string {
  return SITE_PAGE_STATUS_LABELS[status] ?? status;
}

const PRODUCT_STATUS_LABELS: Record<string, string> = {
  active: "Attivo",
  draft: "Bozza",
  archived: "Archiviato",
};

export function productStatusLabel(status: string): string {
  return PRODUCT_STATUS_LABELS[status] ?? status;
}

const AD_OBJECTIVE_LABELS: Record<string, string> = {
  awareness: "Notorieta'",
  traffic: "Traffico",
  engagement: "Engagement",
  leads: "Lead",
  conversions: "Conversioni",
};

export function adObjectiveLabel(objective: string): string {
  return AD_OBJECTIVE_LABELS[objective] ?? objective;
}

const CHANNEL_LABELS: Record<string, string> = {
  meta: "Meta",
  google: "Google",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
  x: "X",
};

export function channelLabel(channel: string): string {
  return CHANNEL_LABELS[channel] ?? channel;
}

/** Durata in millisecondi formattata in modo compatto ("1,2s", "450 ms", "2 min"). */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1).replace(".", ",")} s`;
  return `${Math.round(ms / 60_000)} min`;
}

/** Percentuale con una cifra decimale, in italiano ("4,8%"). */
export function formatPercent(value: number, decimals = 1): string {
  return `${value.toFixed(decimals).replace(".", ",")}%`;
}

/** Due o piu' classi CSS unite, ignorando valori falsy. */
export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

const dateFormatter = new Intl.DateTimeFormat("it-IT", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const timeFormatter = new Intl.DateTimeFormat("it-IT", {
  hour: "2-digit",
  minute: "2-digit",
});

const dateTimeFormatter = new Intl.DateTimeFormat("it-IT", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatDate(iso: string): string {
  return dateFormatter.format(new Date(iso));
}

export function formatDateTime(iso: string): string {
  return dateTimeFormatter.format(new Date(iso));
}

/** "2 ore fa", "3 giorni fa" — utente in italiano. */
export function formatRelative(iso: string | null): string {
  if (!iso) return "Mai eseguito";
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "Ora";
  if (minutes < 60) return `${minutes} min fa`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "ora" : "ore"} fa`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} ${days === 1 ? "giorno" : "giorni"} fa`;
  return formatDate(iso);
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("it-IT").format(value);
}

export function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat("it-IT", { notation: "compact", maximumFractionDigits: 1 }).format(
    value,
  );
}

export function formatCurrency(value: number, currency = "EUR"): string {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

/** Data/ora corrente in italiano, per l'header della Dashboard. */
export function formatGreeting(now: Date): string {
  const hour = now.getHours();
  if (hour < 13) return "Buongiorno";
  if (hour < 18) return "Buon pomeriggio";
  return "Buonasera";
}

export function formatFullDate(now: Date): string {
  return new Intl.DateTimeFormat("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(now);
}

export function formatTime(now: Date): string {
  return timeFormatter.format(now);
}

/** Percentuale di avanzamento, clampata 0..100. */
export function clampProgress(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}
