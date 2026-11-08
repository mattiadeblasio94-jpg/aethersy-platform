import { saveIntegrationCredential } from "../pipeline/repo.js";
import { connectorById, googleServicesForScopes, type ConnectorSpec } from "./catalog.js";
import { encryptBundle, exchangeConnectorCode, type ConnectorClient } from "./oauth.js";

// Parte finale del flusso di collegamento, condivisa fra il callback dei
// connettori (`/api/pipeline/connectors/:id/callback`) e il callback sociale
// (`/api/auth/social/{google,github}/callback`).
//
// Il callback unificato serve perche' Google e GitHub accettano un solo
// callback URL per app: login e collegamento dei connettori devono tornare
// dalla stessa porta.
//
// Con Google un solo accesso puo' coprire piu' servizi: il token concesso
// viene salvato per ciascun servizio incluso nel consenso, cosi' Gmail,
// Drive, Calendar... risultano collegati dopo un unico login.

export interface ConnectorCompletion {
  ok: boolean;
  /** URL di rientro nella UI (mai un redirect aperto: e' costruito qui). */
  redirect: string;
  message: string;
  errorCode: string | null;
}

export async function completeConnectorAuthorization(params: {
  spec: ConnectorSpec;
  code: string;
  codeVerifier: string;
  tenantId: string;
  /** Base URL pubblica della piattaforma (per il rientro). */
  platformUrl: string;
  /** Client OAuth da usare (app di piattaforma o app del tenant). */
  client?: ConnectorClient | null;
}): Promise<ConnectorCompletion> {
  const { spec, code, codeVerifier, tenantId, platformUrl } = params;
  const back = (query: Record<string, string>): string => {
    const url = new URL(`${platformUrl}/connectors`);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
    return url.toString();
  };

  try {
    const bundle = await exchangeConnectorCode(spec, code, codeVerifier, params.client ?? null);
    const grantedScopes = bundle.scope
      ? bundle.scope.split(" ").filter(Boolean)
      : spec.scopes;
    const secretEnc = encryptBundle(bundle);
    const meta = {
      connected_at: new Date().toISOString(),
      auth: spec.auth,
      granted_scopes: grantedScopes,
      ...(bundle.extra ?? {}),
    };

    // Un solo accesso Google puo' attivare piu' servizi: si salva il token
    // per ogni servizio coperto dagli scope concessi.
    const targets = new Set<string>([spec.id]);
    if (spec.auth === "google") {
      for (const serviceId of googleServicesForScopes(grantedScopes)) targets.add(serviceId);
      if (spec.master) {
        for (const serviceId of spec.masterServices ?? []) targets.add(serviceId);
      }
    }

    for (const provider of targets) {
      const target = connectorById(provider);
      if (!target) continue;
      await saveIntegrationCredential({
        tenantId,
        provider,
        kind: "oauth",
        label: provider,
        secretEnc,
        scopes: target.scopes,
        meta: { ...meta, master: provider !== spec.id ? spec.id : undefined },
      });
    }

    const connected = [...targets];
    const message =
      connected.length > 1
        ? `${spec.label} collegato: attivati anche ${connected.filter((id) => id !== spec.id).length} servizi.`
        : `${spec.label} collegato.`;

    return {
      ok: true,
      redirect: back({ connected: spec.id, message }),
      message,
      errorCode: null,
    };
  } catch (err) {
    return {
      ok: false,
      redirect: back({
        connect: spec.id,
        error: "CONNECTOR_FAILED",
        message: `Collegamento a ${spec.label} fallito: ${(err as Error).message}`,
      }),
      message: `Collegamento a ${spec.label} fallito: ${(err as Error).message}`,
      errorCode: "CONNECTOR_FAILED",
    };
  }
}
