// Genera i moduli `schema.ts` dai sorgenti SQL (`schema.sql`).
// Serve perche' tsc non copia i file .sql in dist/: il DDL deve vivere nel bundle.
// Uso: npm run gen:schema
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.resolve(here, "..", "src");

// Ogni voce: cartella sotto src/, nome della costante esportata, fonte SQL.
const TARGETS = [
  { dir: "metering", constName: "METERING_SCHEMA_SQL", sql: "schema.sql" },
  { dir: "pipeline", constName: "PIPELINE_SCHEMA_SQL", sql: "schema.sql" },
  { dir: "business", constName: "BUSINESS_SCHEMA_SQL", sql: "schema.sql" },
];

for (const target of TARGETS) {
  const moduleDir = path.join(srcDir, target.dir);
  const sqlPath = path.join(moduleDir, target.sql);
  const tsPath = path.join(moduleDir, "schema.ts");

  const sql = fs.readFileSync(sqlPath, "utf8").replace(/\r\n/g, "\n");

  const header = [
    "// GENERATO da schema.sql - non modificare a mano.",
    "// Rigenera con: npm --prefix console/server run gen:schema",
    "// Il DDL vive nel bundle perche' tsc non copia i .sql in dist/.",
    "// Idempotente: rieseguibile a ogni avvio del BFF. Vedi docs/platform-consumption.md sez. 4.1.",
    "",
    `export const ${target.constName}: string = ` + JSON.stringify(sql.trimEnd() + "\n") + ";",
    "",
  ].join("\n");

  fs.writeFileSync(tsPath, header, "utf8");
  console.log(`${target.dir}/schema.ts rigenerato (${header.length} caratteri)`);
}
