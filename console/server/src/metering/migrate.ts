import { db, meteringActive } from "./db.js";
import { METERING_SCHEMA_SQL } from "./schema.js";

// Migrator del metering: applica il DDL idempotente all'avvio del BFF.
//
// Il DDL vive nel bundle TS (`schema.ts`, generato da `schema.sql`) perche' tsc
// non copia i `.sql` in `dist/`. E' idempotente: `CREATE ... IF NOT EXISTS` +
// `ON CONFLICT DO NOTHING` sul seed del price book, quindi rieseguirlo a ogni
// boot e' sicuro. Non tocca lo schema `public` di Activepieces.
//
// Il multi-statement viene eseguito con il simple query protocol di Postgres
// (nessun parametro bindato) in una singola transazione implicita.

let applied = false;

export async function migrateMetering(): Promise<{ applied: boolean }> {
  if (!meteringActive()) return { applied: false };
  if (applied) return { applied: false };

  const client = await db().connect();
  try {
    await client.query("BEGIN");
    await client.query(METERING_SCHEMA_SQL);
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
