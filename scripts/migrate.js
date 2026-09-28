import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getPool } from "../server/db/client.js";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../migrations");
const pool = getPool();
await pool.query("CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
const applied = new Set((await pool.query("SELECT name FROM schema_migrations")).rows.map((r) => r.name));
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
  if (applied.has(f)) continue;
  const c = await pool.connect();
  try { await c.query("BEGIN"); await c.query(fs.readFileSync(path.join(dir, f), "utf8")); await c.query("INSERT INTO schema_migrations(name) VALUES($1)", [f]); await c.query("COMMIT"); console.log("applied", f); }
  catch (e) { await c.query("ROLLBACK"); console.error("FAILED", f, e.message); process.exitCode = 1; break; }
  finally { c.release(); }
}
await pool.end();
