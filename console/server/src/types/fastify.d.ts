// =============================================================================
// Augmentazione dei tipi Fastify: il contesto tenant risolto dal BFF.
//
// Le rotte del builder (/api/builder/*) operano per tenant: il tenant viene
// risolto una volta per richiesta nell'hook `onRequest` di `builderRoutes` e
// depositato su `request.tenant`. Senza questa dichiarazione `request.tenant`
// non esisteva sul tipo Fastify e il compilatore segnalava TS2339.
//
// Il tipo resta in `src/types/fastify.d.ts` perche' l'augmentazione deve
// essere visibile a tutti i file che importano Fastify.
// =============================================================================

import "fastify";
import type { TenantContext } from "../metering/repo.js";

declare module "fastify" {
  interface FastifyRequest {
    /** Tenant risolto per la richiesta (vedi builder/routes.ts). */
    tenant: TenantContext;
  }
}

export {};
