import { readFile } from "node:fs/promises";
import { Pool } from "pg";
if (!process.env.FRONTEND_DATABASE_URL) throw new Error("FRONTEND_DATABASE_URL is required");
const pool = new Pool({ connectionString: process.env.FRONTEND_DATABASE_URL });
try {
  await pool.query(await readFile(new URL("./session-schema.sql", import.meta.url), "utf8"));
  console.log("Web session schema ready");
} catch {
  process.exitCode = 1;
  console.error("Web session migration failed; check database access");
} finally {
  await pool.end();
}
