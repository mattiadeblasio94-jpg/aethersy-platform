import { db, meteringActive } from "../metering/db.js";
import { BUSINESS_SCHEMA_SQL } from "./schema.js";

// Migrator dello schema `business` (P1.1): DDL idempotente applicato all'avvio
// del BFF, dopo `metering` e `pipeline`.
//
// Come per gli altri schemi, il DDL vive nel bundle TS (`schema.ts`, generato da
// `schema.sql`) perche' tsc non copia i `.sql` in dist/. Dipende da
// `metering.tenant` (FK): la migrazione del metering deve essere eseguita prima.

let applied = false;

export async function migrateBusiness(): Promise<{ applied: boolean }> {
  if (!meteringActive()) return { applied: false };
  if (applied) return { applied: false };

  const client = await db().connect();
  try {
    await client.query("BEGIN");
    await client.query(BUSINESS_SCHEMA_SQL);
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
