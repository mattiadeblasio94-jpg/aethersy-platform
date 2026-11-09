import { config, hasDbConfig } from "../config.js";
import { db } from "../metering/db.js";
import { decryptSecret, encryptSecret, hasSecretsKey } from "../pipeline/secrets.js";

// Archivio delle credenziali per gli accessi social.
//
// Il BFF crea gli account su Activepieces con una password nota (scelta
// dell'utente al momento della registrazione, o casuale per gli account nati da
// Google/GitHub). Salvandola cifrata può rientrare come l'utente e ottenere un
// token Activepieces valido, senza chiedere la password all'utente.
//
// La password non lascia mai il database in chiaro: e' cifrata con AES-256-GCM
// (pipeline/secrets.ts). Se la chiave non e' configurata l'archivio resta
// disabilitato e il login social apre una sessione senza token Activepieces.

export type IdentityProvider = "email" | "google" | "github" | "telegram";

export interface StoredIdentity {
  email: string;
  provider: IdentityProvider;
  apUserId: string | null;
  /** Password Activepieces in chiaro: viene decifrata al volo e non viene mai salvata in chiaro. */
  password: string | null;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Vero se l'archivio e' utilizzabile (DB configurato + chiave di cifratura). */
export function identityStoreAvailable(): boolean {
  return hasDbConfig() && hasSecretsKey();
}

/**
 * Salva (o aggiorna) la credenziale Activepieces di un'identita'.
 * `password` viene cifrata prima di scrivere; `null` la lascia invariata.
 */
export async function saveIdentityCredential(
  email: string,
  password: string | null,
  provider: IdentityProvider = "email",
  apUserId: string | null = null,
): Promise<void> {
  if (!identityStoreAvailable()) return;
  const key = normalizeEmail(email);
  if (!key) return;

  const encrypted = password === null ? null : encryptSecret(password);
  await db().query(
    `INSERT INTO auth.identity_credential (email, provider, ap_user_id, ap_password_enc)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (email) DO UPDATE
       SET provider = EXCLUDED.provider,
           ap_user_id = COALESCE(EXCLUDED.ap_user_id, auth.identity_credential.ap_user_id),
           ap_password_enc = COALESCE(EXCLUDED.ap_password_enc, auth.identity_credential.ap_password_enc),
           updated_at = now()`,
    [key, provider, apUserId, encrypted],
  );
}

/** Legge la credenziale di un'identita'; `null` se assente o non decifrabile. */
export async function loadIdentityCredential(email: string): Promise<StoredIdentity | null> {
  if (!identityStoreAvailable()) return null;
  const key = normalizeEmail(email);
  if (!key) return null;

  const res = await db().query<{
    email: string;
    provider: IdentityProvider;
    ap_user_id: string | null;
    ap_password_enc: string | null;
  }>("SELECT email, provider, ap_user_id, ap_password_enc FROM auth.identity_credential WHERE email = $1", [
    key,
  ]);
  const row = res.rows[0];
  if (!row) return null;

  let password: string | null = null;
  if (row.ap_password_enc) {
    try {
      password = decryptSecret(row.ap_password_enc);
    } catch {
      // Cifratura non leggibile (chiave ruotata o blob corrotto): si comporta
      // come se la credenziale non esistesse, senza far fallire il login.
      password = null;
    }
  }

  return { email: row.email, provider: row.provider, apUserId: row.ap_user_id, password };
}
