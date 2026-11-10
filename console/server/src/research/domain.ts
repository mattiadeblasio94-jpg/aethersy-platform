// research/domain.ts — verifica REALE di disponibilita' di un nome dominio.
//
// Non si puo' "acquistare" un dominio qui, ma si puo' verificare se il nome
// e' gia' registrato: la risposta DNS del TLD (NXDOMAIN) e' il segnale
// immediato. Il risultato e' dichiarato come "probabilmente libero" perche' la
// disponibilita' definitiva la decide solo il registrar.

import dns from "node:dns/promises";

export interface DomainCheck {
  domain: string;
  tld: string;
  /** "taken" = risoluzione DNS presente, "likely_available" = nessun record. */
  status: "taken" | "likely_available" | "unknown";
  detail: string;
}

const DEFAULT_TLDS = ["com", "it", "io", "ai", "co"];

function asciiDomain(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9.-]/g, "")
    .replace(/^[.-]+|[.-]+$/g, "");
}

async function resolves(domain: string): Promise<boolean> {
  try {
    const records = await dns.resolveAny(domain);
    return records.length > 0;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOTFOUND" || code === "ENODATA") return false;
    throw err;
  }
}

/**
 * Verifica il nome su piu' TLD. Il nome viene normalizzato (ASCII, minuscolo)
 * e il TLD viene gia' incluso dal chiamante se necessario.
 */
export async function checkDomains(
  name: string,
  tlds: string[] = DEFAULT_TLDS,
): Promise<DomainCheck[]> {
  const base = asciiDomain(name).replace(/\.[a-z]{2,}$/i, "");
  if (!base) return [];
  const out: DomainCheck[] = [];
  for (const tld of tlds) {
    const domain = `${base}.${tld}`;
    try {
      const taken = await resolves(domain);
      out.push({
        domain,
        tld,
        status: taken ? "taken" : "likely_available",
        detail: taken
          ? "Il nome resolve in DNS: dominio gia' registrato o in uso."
          : "Nessun record DNS per il nome: probabilmente libero (verifica definitiva presso il registrar).",
      });
    } catch (err) {
      out.push({
        domain,
        tld,
        status: "unknown",
        detail: `Verifica DNS non riuscita: ${(err as Error).message}`,
      });
    }
  }
  return out;
}

/** Report markdown della disponibilita' dei domini. */
export function formatDomainChecks(checks: DomainCheck[]): string {
  if (checks.length === 0) return "";
  const lines = checks.map(
    (check) =>
      `- **${check.domain}** — ${check.status === "taken" ? "gia' registrato" : check.status === "likely_available" ? "probabilmente libero" : "non verificabile"}: ${check.detail}`,
  );
  return ["## Disponibilita' domini (verifica DNS reale)", "", ...lines].join("\n");
}
