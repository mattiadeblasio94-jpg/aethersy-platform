import { db } from "../metering/db.js";
import { hasDbConfig } from "../config.js";
import { AUTH_SCHEMA_SQL } from "./schema.js";

// Migrator dello schema `auth`: DDL idempotente applicato all'avvio del BFF.
// Non dipende dal metering (le credenziali servono anche con METERING_ENABLED
// spento), ma usa lo stesso Postgres dello stack.

let applied = false;

export async function migrateAuth(): Promise<{ applied: boolean }> {
  if (!hasDbConfig()) return { applied: false };
  if (applied) return { applied: false };

  const client = await db().connect();
  try {
    await client.query("BEGIN");
    await client.query(AUTH_SCHEMA_SQL);
    await client.query("COMMIT");
    applied = true;
    return { applied: true };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
