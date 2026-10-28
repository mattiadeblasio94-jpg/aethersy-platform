import pg from "pg";
import { config, hasDbConfig } from "../config.js";

// Pool Postgres condiviso per lo schema `metering`. Nessuna dipendenza a
// livello di modulo: il pool viene creato lazy, solo alla prima query, cosi'
// il BFF parte anche se il DB non e' ancora raggiungibile (e con
// METERING_ENABLED=false non viene mai istanziato).
//
// Il DSN punta allo stesso Postgres dello stack Activepieces, ma il metering
// vive in uno schema separato: nessuna interferenza con lo schema `public`.

let pool: pg.Pool | null = null;

export function meteringActive(): boolean {
  return config.meteringEnabled && hasDbConfig();
}

/** Opzioni di connessione: DSN se presente, altrimenti parametri discreti. */
function poolOptions(): pg.PoolConfig {
  const base: pg.PoolConfig = {
    max: 8,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    application_name: "aethersy-console-metering",
  };
  if (config.dbUrl) return { ...base, connectionString: config.dbUrl };
  return {
    ...base,
    host: config.pg.host,
    port: config.pg.port,
    user: config.pg.user,
    password: config.pg.password,
    database: config.pg.database,
  };
}

export function db(): pg.Pool {
  if (!hasDbConfig()) throw new Error("Postgres non configurato (CONSOLE_DB_URL o CONSOLE_PG*)");
  if (!pool) {
    pool = new pg.Pool(poolOptions());
    // Un errore su un client idle non deve far crashare il processo.
    pool.on("error", (err) => {
      // eslint-disable-next-line no-console
      console.error("[metering] postgres idle error:", err.message);
    });
  }
  return pool;
}

export async function withTx<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await db().connect();
  try {
    await client.query("BEGIN");
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
