import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { Logger } from "../logger.js";
import { buildPgPoolConfig } from "../storage/pgPoolConfig.js";

const databaseUrl = process.env["DATABASE_URL"];
if (databaseUrl === undefined || databaseUrl.length === 0) {
  throw new Error("DATABASE_URL is required to run migrations");
}

const schema = await readFile(new URL("../../db/schema.sql", import.meta.url), "utf8");
const pool = new Pool(buildPgPoolConfig(databaseUrl));

try {
  await pool.query(schema);
  Logger.info("[Migration] Database schema applied");
} finally {
  await pool.end();
}
