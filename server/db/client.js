import { Pool } from "@neondatabase/serverless";
let pool;
/** Single shared pool. Use the Neon *pooled* connection string (host contains "-pooler"). Server-side only. */
export function getPool() {
  if (!process.env.DATABASE_URL) throw Object.assign(new Error("DATABASE_URL is not set. Copy your Neon connection string into .env (see README)."), { code: "DB_CONFIG" });
  return (pool ??= new Pool({ connectionString: process.env.DATABASE_URL, max: 10 }));
}
