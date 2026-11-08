import { withTx } from "../metering/db.js";
import { decryptSecret, encryptSecret } from "../pipeline/secrets.js";

// App OAuth dei provider registrate dal tenant.
//
// Il provider (Slack, Notion, Figma, ...) obbliga a creare un'app nella sua
// console sviluppatore: il tenant la crea una volta sola e registra qui
// client_id e client_secret. Da quel momento il pulsante "Accedi con
// <Provider>" porta davvero alla pagina di login del provider e il consenso
// torna alla piattaforma.
//
// Il secret e' cifrato a riposo (AES-256-GCM, stessa chiave dei token OAuth).

export interface ConnectorApp {
  provider: string;
  clientId: string;
  /** Secret in chiaro: non esce mai dal server (mai inviato al frontend). */
  clientSecret: string;
  redirectUri: string | null;
  updatedAt: string;
  /** False se la riga esiste ma il secret non e' decifrabile. */
  valid: boolean;
}

interface AppRow {
  provider: string;
  client_id: string;
  client_secret_enc: string;
  redirect_uri: string | null;
  updated_at: Date | string;
}

function toApp(row: AppRow): ConnectorApp {
  let clientSecret = "";
  let valid = true;
  try {
    clientSecret = decryptSecret(row.client_secret_enc);
  } catch {
    valid = false;
  }
  return {
    provider: row.provider,
    clientId: row.client_id,
    clientSecret,
    redirectUri: row.redirect_uri,
    updatedAt: new Date(row.updated_at).toISOString(),
    valid,
  };
}

/** App registrate dal tenant, indicizzate per provider. */
export async function listConnectorApps(
  tenantId: string,
): Promise<Map<string, ConnectorApp>> {
  const apps = new Map<string, ConnectorApp>();
  const rows = await withTx(async (client) => {
    const res = await client.query<AppRow>(
      `SELECT provider, client_id, client_secret_enc, redirect_uri, updated_at
         FROM pipeline.oauth_app
        WHERE tenant_id = $1
        ORDER BY provider`,
      [tenantId],
    );
    return res.rows;
  });
  for (const row of rows) apps.set(row.provider, toApp(row));
  return apps;
}

export async function getConnectorApp(
  tenantId: string,
  provider: string,
): Promise<ConnectorApp | null> {
  const row = await withTx(async (client) => {
    const res = await client.query<AppRow>(
      `SELECT provider, client_id, client_secret_enc, redirect_uri, updated_at
         FROM pipeline.oauth_app
        WHERE tenant_id = $1 AND provider = $2`,
      [tenantId, provider],
    );
    return res.rows[0] ?? null;
  });
  return row ? toApp(row) : null;
}

/** Registra (o aggiorna) l'app OAuth del provider per il tenant. */
export async function saveConnectorApp(input: {
  tenantId: string;
  provider: string;
  clientId: string;
  clientSecret: string;
  redirectUri?: string | null;
}): Promise<ConnectorApp> {
  const row = await withTx(async (client) => {
    const res = await client.query<AppRow>(
      `INSERT INTO pipeline.oauth_app
              (tenant_id, provider, client_id, client_secret_enc, redirect_uri)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (tenant_id, provider) DO UPDATE
          SET client_id         = EXCLUDED.client_id,
              client_secret_enc = EXCLUDED.client_secret_enc,
              redirect_uri      = EXCLUDED.redirect_uri,
              updated_at        = now()
       RETURNING provider, client_id, client_secret_enc, redirect_uri, updated_at`,
      [
        input.tenantId,
        input.provider,
        input.clientId.trim(),
        encryptSecret(input.clientSecret.trim()),
        input.redirectUri?.trim() ? input.redirectUri.trim() : null,
      ],
    );
    return res.rows[0];
  });
  return toApp(row);
}

/** Rimuove l'app OAuth del provider (la connessione resta invariata). */
export async function deleteConnectorApp(
  tenantId: string,
  provider: string,
): Promise<boolean> {
  const removed = await withTx(async (client) => {
    const res = await client.query(
      "DELETE FROM pipeline.oauth_app WHERE tenant_id = $1 AND provider = $2",
      [tenantId, provider],
    );
    return (res.rowCount ?? 0) > 0;
  });
  return removed;
}
