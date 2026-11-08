import { saveIntegrationCredential } from "../pipeline/repo.js";
import type { ConnectorSpec } from "./catalog.js";
import { encryptBundle, exchangeConnectorCode } from "./oauth.js";

// Parte finale del flusso di collegamento, condivisa fra il callback dei
// connettori (`/api/pipeline/connectors/:id/callback`) e il callback sociale
// (`/api/auth/social/{google,github}/callback`).
//
// Il callback unificato serve perche' Google e GitHub accettano un solo
// callback URL per app: login e collegamento dei connettori devono tornare
// dalla stessa porta.

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
}): Promise<ConnectorCompletion> {
  const { spec, code, codeVerifier, tenantId, platformUrl } = params;
  const back = (query: Record<string, string>): string => {
    const url = new URL(`${platformUrl}/connectors`);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
    return url.toString();
  };

  try {
    const bundle = await exchangeConnectorCode(spec, code, codeVerifier);
    await saveIntegrationCredential({
      tenantId,
      provider: spec.id,
      kind: "oauth",
      label: spec.id,
      secretEnc: encryptBundle(bundle),
      scopes: bundle.scope ? bundle.scope.split(" ").filter(Boolean) : spec.scopes,
      meta: {
        connected_at: new Date().toISOString(),
        auth: spec.auth,
        ...(bundle.extra ?? {}),
      },
    });
    return {
      ok: true,
      redirect: back({ connected: spec.id, message: `${spec.label} collegato.` }),
      message: `${spec.label} collegato.`,
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
