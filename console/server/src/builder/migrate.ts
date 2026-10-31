// builder/migrate.ts — Idempotent schema migration for builder tables

import { db, meteringActive } from "../metering/db.js";
import { BUILDER_SCHEMA_SQL } from "./schema.js";

let applied = false;

export async function migrateBuilder(): Promise<{ applied: boolean }> {
  if (!meteringActive()) return { applied: false };
  if (applied) return { applied: false };

  const client = await db().connect();
  try {
    await client.query("BEGIN");
    await client.query(BUILDER_SCHEMA_SQL);
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
