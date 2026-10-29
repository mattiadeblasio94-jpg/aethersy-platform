// Catalogo del substrato aziendale (P1.1): etichette e validatori puri, senza
// dipendenze, condivisi fra BFF e Console. Fonte unica di verita' per gli stati
// di obiettivi, memoria e prodotti/servizi.

// --- Obiettivi (goal) --------------------------------------------------------

export type GoalStatus = "active" | "achieved" | "paused" | "abandoned";

export const GOAL_STATUSES: GoalStatus[] = ["active", "achieved", "paused", "abandoned"];
export const GOAL_STATUS_LABELS: Record<GoalStatus, string> = {
  active: "Attivo",
  achieved: "Raggiunto",
  paused: "In pausa",
  abandoned: "Abbandonato",
};

/** Stati terminali: una volta raggiunti/abbandonati non tornano "attivi". */
export const GOAL_TERMINAL: GoalStatus[] = ["achieved", "abandoned"];

export function isGoalStatus(value: string): value is GoalStatus {
  return (GOAL_STATUSES as string[]).includes(value);
}

export function isGoalPriority(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= 5;
}

// --- Memoria (memory) --------------------------------------------------------

export type MemoryKind = "fact" | "note" | "preference" | "constraint" | "decision" | "contact";

export const MEMORY_KINDS: MemoryKind[] = [
  "fact",
  "note",
  "preference",
  "constraint",
  "decision",
  "contact",
];

export const MEMORY_KIND_LABELS: Record<MemoryKind, string> = {
  fact: "Fatto",
  note: "Nota",
  preference: "Preferenza",
  constraint: "Vincolo",
  decision: "Decisione",
  contact: "Contatto",
};

export function isMemoryKind(value: string): value is MemoryKind {
  return (MEMORY_KINDS as string[]).includes(value);
}

// --- Prodotti/servizi (product) ----------------------------------------------

export type ProductKind = "product" | "service";
export type ProductStatus = "draft" | "active" | "archived";

export const PRODUCT_KINDS: ProductKind[] = ["product", "service"];
export const PRODUCT_STATUSES: ProductStatus[] = ["draft", "active", "archived"];

export const PRODUCT_KIND_LABELS: Record<ProductKind, string> = {
  product: "Prodotto",
  service: "Servizio",
};

export const PRODUCT_STATUS_LABELS: Record<ProductStatus, string> = {
  draft: "Bozza",
  active: "Attivo",
  archived: "Archiviato",
};

export function isProductKind(value: string): value is ProductKind {
  return (PRODUCT_KINDS as string[]).includes(value);
}

export function isProductStatus(value: string): value is ProductStatus {
  return (PRODUCT_STATUSES as string[]).includes(value);
}
