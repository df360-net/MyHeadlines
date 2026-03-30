import { Hono } from "hono";
import { sqlite, DB_PATH } from "../db/index.js";
import { runMigrations } from "../db/migrate.js";
import { syncJobsToDb } from "../scheduler/registry.js";

export const adminRoutes = new Hono();

// POST /api/admin/reset — delete all data and start fresh
adminRoutes.post("/reset", (c) => {
  // Only allow requests from localhost
  const host = c.req.header("host") || "";
  if (!host.startsWith("localhost:") && !host.startsWith("127.0.0.1:")) {
    return c.json({ error: "Forbidden" }, 403);
  }

  console.log("[admin] Database reset requested");

  // Drop all tables
  const tables = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    .all() as Array<{ name: string }>;

  for (const { name } of tables) {
    // FTS5 tables need DROP TABLE, not DELETE
    sqlite.exec(`DROP TABLE IF EXISTS "${name}"`);
  }

  // Re-run migrations to recreate empty tables
  runMigrations();

  // Re-sync scheduler jobs so they appear in the UI
  syncJobsToDb();

  console.log("[admin] Database reset complete");

  return c.json({ ok: true, message: "Database reset. Redirecting to setup." });
});
