/**
 * Test database helper — creates an in-memory SQLite DB
 * with the same schema as production, usable in integration tests.
 *
 * Usage: vi.mock("../../src/db/index.js") then import this to wire up.
 */
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "../../src/db/schema.js";

export function createTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.exec("PRAGMA journal_mode = WAL");

  // Create tables (minimal — mirrors migrate.ts but without topic seeding)
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS topics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      is_fixed INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 999,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );

    CREATE TABLE IF NOT EXISTS user_interests (
      id TEXT PRIMARY KEY,
      topic_id INTEGER,
      topic TEXT NOT NULL,
      raw_weight REAL NOT NULL DEFAULT 0.5,
      confidence REAL NOT NULL DEFAULT 0.0,
      source TEXT NOT NULL,
      interaction_count INTEGER NOT NULL DEFAULT 0,
      last_interaction INTEGER NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );

    CREATE TABLE IF NOT EXISTS headlines (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      summary TEXT,
      topic_ids TEXT,
      category_id INTEGER,
      topics TEXT NOT NULL,
      category TEXT,
      source_rss TEXT,
      source_name TEXT,
      published_at INTEGER,
      fetched_at INTEGER NOT NULL,
      score REAL,
      feedback TEXT
    );

    CREATE TABLE IF NOT EXISTS click_events (
      id TEXT PRIMARY KEY,
      headline_id TEXT NOT NULL,
      tracking_id TEXT,
      channel TEXT NOT NULL,
      clicked_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS digest_sends (
      id TEXT PRIMARY KEY,
      headline_ids TEXT NOT NULL,
      channel TEXT NOT NULL,
      sent_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS imported_urls (
      id TEXT PRIMARY KEY,
      url TEXT NOT NULL,
      title TEXT,
      domain TEXT,
      visit_count INTEGER,
      extracted_topics TEXT,
      source TEXT NOT NULL,
      imported_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );

    CREATE TABLE IF NOT EXISTS scheduler_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT,
      group_code TEXT NOT NULL,
      interval_seconds INTEGER NOT NULL,
      timeout_seconds INTEGER NOT NULL DEFAULT 60,
      is_enabled TEXT NOT NULL DEFAULT 'Y',
      daily_run_time TEXT,
      next_run_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );

    CREATE TABLE IF NOT EXISTS scheduler_job_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER NOT NULL,
      job_code TEXT NOT NULL,
      status TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      completed_at INTEGER,
      duration_ms INTEGER,
      records_processed INTEGER,
      output_message TEXT,
      error_message TEXT,
      triggered_by TEXT NOT NULL DEFAULT 'SCHEDULER'
    );

    CREATE TABLE IF NOT EXISTS scheduler_job_run_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_run_id INTEGER NOT NULL,
      level TEXT NOT NULL,
      message TEXT NOT NULL,
      logged_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );

    CREATE TABLE IF NOT EXISTS event_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'RECEIVED',
      payload TEXT NOT NULL,
      received_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      processing_started_at INTEGER,
      processed_at INTEGER,
      retry_count INTEGER NOT NULL DEFAULT 0,
      max_retries INTEGER NOT NULL DEFAULT 3,
      next_retry_at INTEGER,
      error_message TEXT,
      output_message TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_user_interests_topic_id ON user_interests(topic_id);
    CREATE INDEX IF NOT EXISTS idx_headlines_category_id ON headlines(category_id);
    CREATE INDEX IF NOT EXISTS idx_headlines_fetched ON headlines(fetched_at);
    CREATE INDEX IF NOT EXISTS idx_headlines_score ON headlines(score);
    CREATE INDEX IF NOT EXISTS idx_digest_sends_sent ON digest_sends(sent_at);
    CREATE INDEX IF NOT EXISTS idx_sched_jobs_enabled_next ON scheduler_jobs(is_enabled, next_run_at);
    CREATE INDEX IF NOT EXISTS idx_sched_runs_job ON scheduler_job_runs(job_id, started_at);
  `);

  const db = drizzle(sqlite, { schema });
  return { db, sqlite };
}

/** Seed a topic and return its ID. */
export function seedTopic(sqlite: Database, slug: string, displayName?: string, isFixed = false) {
  const display = displayName ?? slug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  sqlite.prepare(`INSERT OR IGNORE INTO topics (slug, display_name, is_fixed, sort_order) VALUES (?, ?, ?, 999)`).run(slug, display, isFixed ? 1 : 0);
  const row = sqlite.prepare(`SELECT id FROM topics WHERE slug = ?`).get(slug) as { id: number };
  return row.id;
}
