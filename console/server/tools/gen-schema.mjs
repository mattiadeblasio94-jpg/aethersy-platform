// Genera src/metering/schema.ts dal sorgente SQL src/metering/schema.sql.
// Serve perche' tsc non copia i file .sql in dist/: il DDL deve vivere nel bundle.
// Uso: npm run gen:schema
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.resolve(here, "..", "src", "metering");
const sqlPath = path.join(srcDir, "schema.sql");
const tsPath = path.join(srcDir, "schema.ts");

const sql = fs.readFileSync(sqlPath, "utf8").replace(/\r\n/g, "\n");

const header = [
  "// GENERATO da schema.sql - non modificare a mano.",
  "// Rigenera con: npm --prefix console/server run gen:schema",
  "// Il DDL vive nel bundle perche' tsc non copia i .sql in dist/.",
  "// Idempotente: rieseguibile a ogni avvio del BFF. Vedi docs/platform-consumption.md sez. 4.1.",
  "",
  "export const METERING_SCHEMA_SQL: string = " + JSON.stringify(sql.trimEnd() + "\n") + ";",
  "",
].join("\n");

fs.writeFileSync(tsPath, header, "utf8");
console.log(`schema.ts rigenerato (${header.length} caratteri)`);
