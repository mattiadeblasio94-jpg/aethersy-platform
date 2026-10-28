// =============================================================================
// Mock layer (Stadio C). Dati di Impostazioni (profilo, fatturazione,
// integrazioni, notifiche) e Aiuto. Stesso principio degli stadi precedenti:
// dati realistici, tipizzati, deterministici e SENZA alcun dato sensibile.
//
// In particolare: nessun numero di carta reale (solo ultime 4 cifre), nessuna
// chiave API completa (solo il prefisso pubblico) e nessun URL di webhook
// segreto. Quando i backend reali saranno disponibili, la UI non cambia: cambia
// solo l'origine dati in src/lib/api.ts.
// =============================================================================

import type {
  ApiKey,
  FaqItem,
  HelpCategory,
  HelpDoc,
  Invoice,
  NotificationPreferences,
  PaymentMethod,
  PlatformNotificationPreference,
  PlatformId,
  ServiceStatus,
  UserProfile,
  Webhook,
} from "@/lib/types";

// --- Helper deterministici -------------------------------------------------

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

function isoHoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 3_600_000).toISOString();
}

// --- Profilo ---------------------------------------------------------------

export const userProfile: UserProfile = {
  id: "user-1",
  name: "Mattia De Blasio",
  email: "mattia@aethersy.online",
  phone: "+39 351 000 0000",
  company: "Aethersy Studio",
  bio: "Fondatore di Aethersy. Gestisco agenzie digitali e piccole attivita' con agenti AI.",
  language: "it",
  timezone: "Europe/Rome",
  theme: "dark",
  avatar: undefined,
};

/** Opzioni per i campi select del profilo (usate dalla pagina Impostazioni). */
export const languageOptions = [
  { value: "it", label: "Italiano" },
  { value: "en", label: "English" },
  { value: "es", label: "Espanol" },
  { value: "fr", label: "Francais" },
  { value: "de", label: "Deutsch" },
];

export const timezoneOptions = [
  { value: "Europe/Rome", label: "Roma (GMT+1)" },
  { value: "Europe/London", label: "Londra (GMT+0)" },
  { value: "Europe/Paris", label: "Parigi (GMT+1)" },
  { value: "America/New_York", label: "New York (GMT-5)" },
  { value: "Asia/Dubai", label: "Dubai (GMT+4)" },
];

// --- Fatturazione ----------------------------------------------------------

/** Consumo crediti del piano Pro: usato / totale disponibile. */
export const creditUsage = { used: 1250, total: 2000, plan: "pro" as const };

export const invoices: Invoice[] = [
  {
    id: "inv-2026-10",
    number: "AETH-2026-0102",
    date: isoDaysAgo(6),
    amount: 79,
    currency: "EUR",
    status: "paid",
  },
  {
    id: "inv-2026-09",
    number: "AETH-2026-0088",
    date: isoDaysAgo(36),
    amount: 79,
    currency: "EUR",
    status: "paid",
  },
  {
    id: "inv-2026-08",
    number: "AETH-2026-0071",
    date: isoDaysAgo(66),
    amount: 79,
    currency: "EUR",
    status: "paid",
  },
  {
    id: "inv-2026-07",
    number: "AETH-2026-0054",
    date: isoDaysAgo(96),
    amount: 79,
    currency: "EUR",
    status: "paid",
  },
  {
    id: "inv-2026-06",
    number: "AETH-2026-0039",
    date: isoDaysAgo(126),
    amount: 29,
    currency: "EUR",
    status: "paid",
  },
];

// --- Metodi di pagamento ---------------------------------------------------

export const paymentMethods: PaymentMethod[] = [
  {
    id: "pm-1",
    brand: "Visa",
    last4: "4242",
    expiry: "08/28",
    isDefault: true,
  },
  {
    id: "pm-2",
    brand: "Mastercard",
    last4: "8210",
    expiry: "03/27",
    isDefault: false,
  },
];

// --- Integrazioni: chiavi API ----------------------------------------------

export const apiKeys: ApiKey[] = [
  {
    id: "key-1",
    name: "Produzione",
    prefix: "ak_live_",
    environment: "live",
    createdAt: isoDaysAgo(120),
    lastUsedAt: isoHoursAgo(3),
  },
  {
    id: "key-2",
    name: "Staging",
    prefix: "ak_test_",
    environment: "test",
    createdAt: isoDaysAgo(58),
    lastUsedAt: isoDaysAgo(2),
  },
  {
    id: "key-3",
    name: "Integrazione interna",
    prefix: "ak_live_",
    environment: "live",
    createdAt: isoDaysAgo(20),
    lastUsedAt: null,
  },
];

// --- Integrazioni: webhook -------------------------------------------------

export const webhooks: Webhook[] = [
  {
    id: "wh-1",
    url: "https://hooks.aether.studio/aethersy/tasks",
    events: ["task.completed", "task.failed"],
    status: "active",
    createdAt: isoDaysAgo(75),
  },
  {
    id: "wh-2",
    url: "https://nord-retail.it/webhooks/aethersy",
    events: ["post.published", "lead.created"],
    status: "paused",
    createdAt: isoDaysAgo(40),
  },
  {
    id: "wh-3",
    url: "https://api.sudcultura.org/aethersy/events",
    events: ["task.failed"],
    status: "error",
    createdAt: isoDaysAgo(12),
  },
];

/** Catalogo eventi disponibili per i webhook (etichette in italiano). */
export const webhookEventOptions = [
  { value: "task.completed", label: "Task completato" },
  { value: "task.failed", label: "Task fallito" },
  { value: "post.published", label: "Post pubblicato" },
  { value: "lead.created", label: "Nuovo lead" },
  { value: "invoice.paid", label: "Fattura pagata" },
];

// --- Notifiche -------------------------------------------------------------

export const notificationPreferences: NotificationPreferences = {
  email: true,
  push: true,
  weeklyDigest: true,
  failedTaskAlerts: true,
  monthlyReport: false,
  productNews: false,
};

const NOTIFICATION_PLATFORMS: PlatformId[] = [
  "instagram",
  "linkedin",
  "tiktok",
  "x",
  "facebook",
  "youtube",
];

export const platformNotificationPreferences: PlatformNotificationPreference[] =
  NOTIFICATION_PLATFORMS.map((platform, index) => ({
    platform,
    enabled: index < 3,
    cadence: (["realtime", "daily", "weekly", "off", "off", "off"] as const)[index],
  }));

/** Opzioni di frequenza per le preferenze per piattaforma. */
export const notificationCadenceOptions = [
  { value: "realtime", label: "In tempo reale" },
  { value: "daily", label: "Riepilogo giornaliero" },
  { value: "weekly", label: "Riepilogo settimanale" },
  { value: "off", label: "Disattivato" },
];

// --- Aiuto: categorie ------------------------------------------------------

export const helpCategories: HelpCategory[] = [
  {
    id: "getting-started",
    title: "Per iniziare",
    description: "Crea il workspace, collega il brand e attiva i primi agenti.",
    icon: "Rocket",
    articleCount: 8,
  },
  {
    id: "platforms",
    title: "Piattaforme",
    description: "Collega e gestisci Instagram, LinkedIn, TikTok, X, Facebook e YouTube.",
    icon: "Share2",
    articleCount: 12,
  },
  {
    id: "agents",
    title: "Agenti AI",
    description: "Configura obiettivi, scheduling e comportamenti degli agenti.",
    icon: "Sparkles",
    articleCount: 15,
  },
  {
    id: "tasks",
    title: "Task",
    description: "Pianifica, monitora e riprova le esecuzioni degli agenti.",
    icon: "ListChecks",
    articleCount: 9,
  },
  {
    id: "billing",
    title: "Fatturazione",
    description: "Piani, crediti, fatture e metodi di pagamento.",
    icon: "CreditCard",
    articleCount: 7,
  },
  {
    id: "api",
    title: "API e integrazioni",
    description: "Chiavi API, webhook e integrazione con i tuoi sistemi.",
    icon: "Webhook",
    articleCount: 11,
  },
];

// --- Aiuto: FAQ ------------------------------------------------------------

export const faqItems: FaqItem[] = [
  {
    id: "faq-1",
    category: "getting-started",
    question: "Come creo il mio primo workspace?",
    answer:
      "Al primo accesso, segui l'onboarding: descrivi la tua attivita', scegli il piano e collega almeno una piattaforma. Il workspace viene creato automaticamente e resta selezionabile dal menu in alto a sinistra.",
  },
  {
    id: "faq-2",
    category: "getting-started",
    question: "Posso gestire piu' workspace con un solo account?",
    answer:
      "Si'. I workspace sono indipendenti fra loro: ogni workspace ha agenti, piattaforme e crediti propri. Puoi passare da uno all'altro dal selettore nel drawer.",
  },
  {
    id: "faq-3",
    category: "platforms",
    question: "Quali piattaforme posso collegare?",
    answer:
      "Instagram, LinkedIn, TikTok, X, Facebook e YouTube. Per ognuna Aethersy richiede solo le autorizzazioni necessarie alla pubblicazione e alla lettura delle metriche: non vede mai la tua password.",
  },
  {
    id: "faq-4",
    category: "platforms",
    question: "Perche' una piattaforma resta 'in attesa'?",
    answer:
      "Lo stato 'in attesa' indica che l'autorizzazione e' iniziata ma non e' stata completata. Riapri la card della piattaforma in Social Media e premi 'Completa collegamento' per concludere la procedura.",
  },
  {
    id: "faq-5",
    category: "agents",
    question: "Quanti agenti posso attivare contemporaneamente?",
    answer:
      "Il numero di agenti dipende dal piano: Starter ne include 2, Pro 10, Enterprise illimitati. Puoi mettere in pausa un agente in qualsiasi momento senza perdere la sua configurazione.",
  },
  {
    id: "faq-6",
    category: "agents",
    question: "Gli agenti rispettano il tono di voce del brand?",
    answer:
      "Si'. Ogni agente eredita il tono di voce definito nel workspace e puoi affinarlo con esempi e istruzioni specifiche durante la creazione.",
  },
  {
    id: "faq-7",
    category: "tasks",
    question: "Come riprovo un task fallito?",
    answer:
      "Apri il task dalla pagina Task, controlla il log dell'agente e premi 'Riprova'. Se l'errore dipende da un token scaduto, riconnetti prima la piattaforma interessata.",
  },
  {
    id: "faq-8",
    category: "tasks",
    question: "Posso programmare un task per una data futura?",
    answer:
      "Si'. Durante la creazione o dall'agenda dei contenuti puoi impostare data e ora. I task programmati compaiono nella sezione Task e nella panoramica della dashboard.",
  },
  {
    id: "faq-9",
    category: "billing",
    question: "Come funzionano i crediti?",
    answer:
      "Ogni esecuzione di un agente consuma crediti in base alla complessita' dell'operazione. La barra in Impostazioni > Fatturazione mostra il consumo del periodo; i crediti non utilizzati si azzerano all'inizio del ciclo.",
  },
  {
    id: "faq-10",
    category: "billing",
    question: "Posso cambiare piano in qualsiasi momento?",
    answer:
      "Si'. Il passaggio a un piano superiore e' immediato; il downgrade diventa effettivo dal ciclo di fatturazione successivo. Nessun costo di attivazione.",
  },
  {
    id: "faq-11",
    category: "api",
    question: "Dove trovo le mie chiavi API?",
    answer:
      "In Impostazioni > Integrazioni. Per sicurezza mostriamo solo il prefisso della chiave: la chiave completa e' visibile una sola volta, al momento della creazione.",
  },
  {
    id: "faq-12",
    category: "api",
    question: "Come configuro un webhook?",
    answer:
      "Sempre in Impostazioni > Integrazioni: aggiungi l'URL di destinazione e seleziona gli eventi da ricevere. Aethersy invia una richiesta POST firmata a ogni evento attivato.",
  },
];

// --- Aiuto: documentazione e canali ----------------------------------------

export const helpDocs: HelpDoc[] = [
  {
    id: "doc-quickstart",
    title: "Guida rapida",
    description: "Dai primi passi alla prima pubblicazione automatica in 10 minuti.",
    url: "https://docs.aethersy.online/quickstart",
  },
  {
    id: "doc-agents",
    title: "Manuale degli agenti",
    description: "Come progettare obiettivi, vincoli e scheduling degli agenti.",
    url: "https://docs.aethersy.online/agents",
  },
  {
    id: "doc-api",
    title: "Riferimento API",
    description: "Endpoint, autenticazione con chiavi API ed esempi di webhook.",
    url: "https://docs.aethersy.online/api",
  },
];

// --- Aiuto: stato dei servizi ----------------------------------------------

export const serviceStatuses: ServiceStatus[] = [
  { id: "svc-app", name: "Piattaforma web", status: "operational", uptime: 99.98 },
  { id: "svc-agents", name: "Runtime agenti", status: "operational", uptime: 99.92 },
  { id: "svc-publish", name: "Pubblicazione social", status: "degraded", uptime: 99.41 },
  { id: "svc-api", name: "API pubblica", status: "operational", uptime: 99.99 },
  { id: "svc-webhooks", name: "Consegna webhook", status: "operational", uptime: 99.87 },
];

/** Aggiornamento dello stato piattaforma mostrato nella pagina Aiuto. */
export const statusUpdatedAt = isoHoursAgo(1);
