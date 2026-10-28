import crypto from "node:crypto";
import { config } from "../config.js";

// Cifratura a riposo dei segreti di integrazione (token OAuth, webhook, api key).
// AES-256-GCM con chiave derivata dalla master key di ambiente: nel database
// finisce solo il blob cifrato (base64 di `iv || tag || ciphertext`), mai il
// valore in chiaro. Formato auto-descrittivo con prefisso di versione, cosi'
// una futura rotazione della chiave puo' essere gestita senza ambiguita'.
//
// La master key arriva da `CONSOLE_SECRETS_KEY` (fallback `AP_ENCRYPTION_KEY`),
// come stringa esadecimale di 64 caratteri (32 byte).
//
// Riferimento: docs/platform-consumption.md sez. 2 (`integration_credential`)
// e sez. 4.7 (HITL, PII/GDPR -> cifratura credenziali).

const VERSION = "v1";
const IV_BYTES = 12; // 96 bit, raccomandato per GCM
const TAG_BYTES = 16;

/** Errore esplicito quando manca o e' invalida la chiave di cifratura. */
export class SecretsKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SecretsKeyError";
  }
}

/** Vero se la chiave di cifratura e' configurata (non necessariamente valida). */
export function hasSecretsKey(): boolean {
  return config.secretsKey.length > 0;
}

function masterKey(): Buffer {
  const raw = config.secretsKey;
  if (!raw) {
    throw new SecretsKeyError(
      "Chiave di cifratura assente: imposta CONSOLE_SECRETS_KEY (o AP_ENCRYPTION_KEY)",
    );
  }
  // Accetta hex (64 char) come formato canonico; in alternativa una passphrase
  // arbitraria viene derivata con scrypt e un salt fisso di dominio.
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, "hex");
  }
  return crypto.scryptSync(raw, "aethersy-integration-secrets-v1", 32);
}

/** Cifra un segreto in chiaro; ritorna `v1:<base64(iv|tag|ciphertext)>`. */
export function encryptSecret(plaintext: string): string {
  const key = masterKey();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${VERSION}:${Buffer.concat([iv, tag, enc]).toString("base64")}`;
}

/**
 * Decifra un blob prodotto da `encryptSecret`.
 * Lancia se il formato non e' riconosciuto o se il tag GCM non verifica
 * (manomissione o chiave errata): nessun fallback silenzioso a testo in chiaro.
 */
export function decryptSecret(blob: string): string {
  const sep = blob.indexOf(":");
  if (sep < 0 || blob.slice(0, sep) !== VERSION) {
    throw new SecretsKeyError("Formato del segreto non riconosciuto");
  }
  const buf = Buffer.from(blob.slice(sep + 1), "base64");
  if (buf.length <= IV_BYTES + TAG_BYTES) {
    throw new SecretsKeyError("Blob cifrato troncato");
  }
  const iv = buf.subarray(0, IV_BYTES);
  const tag = buf.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const enc = buf.subarray(IV_BYTES + TAG_BYTES);
  const decipher = crypto.createDecipheriv("aes-256-gcm", masterKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}
