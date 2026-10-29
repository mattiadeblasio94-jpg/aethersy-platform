import type { FastifyReply, FastifyRequest } from "fastify";
import { meteringActive } from "../metering/db.js";
import { resolveTenant } from "../metering/guard.js";
import type { TenantContext } from "../metering/repo.js";

// Guard tenant condiviso dalle rotte che leggono/scrivono gli schemi
// `pipeline` e `platform`: cookie di sessione Console oppure Bearer API key.
//
// Ritorna il tenant, oppure `null` avendo gia' scritto la risposta d'errore
// (503 se il metering e' spento: senza di esso gli schemi non esistono; 401 se
// l'identita' non e' valida). Estratto da `routes.ts` per essere riusato senza
// duplicare la logica di autenticazione.

export async function requireMeteredTenant(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<TenantContext | null> {
  if (!meteringActive()) {
    reply.code(503).send({
      code: "METERING_DISABLED",
      message: "Questa sezione richiede il metering attivo (METERING_ENABLED=true)",
    });
    return null;
  }
  const tenant = await resolveTenant(request);
  if (!tenant) {
    reply.code(401).send({ code: "UNAUTHENTICATED", message: "Identita' tenant non valida" });
    return null;
  }
  return tenant;
}
