/**
 * Scheduler & Event Queue schema.
 * Modeled after AskSQL's proven architecture.
 */

import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// ── Job Definitions ───────────────────────────────────────
export const schedulerJobs = sqliteTable("scheduler_jobs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  groupCode: text("group_code").notNull(), // "FETCH", "SCORING", "DELIVERY", "MAINTENANCE"
  intervalSeconds: integer("interval_seconds").notNull(),
  timeoutSeconds: integer("timeout_seconds").notNull().default(60),
  isEnabled: text("is_enabled").notNull().default("Y"), // "Y" | "N"
  dailyRunTime: text("daily_run_time"), // "HH:MM" in user's local timezone (null = interval-based)
  nextRunAt: integer("next_run_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

// ── Job Run History ───────────────────────────────────────
export const schedulerJobRuns = sqliteTable("scheduler_job_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jobId: integer("job_id").notNull(),
  jobCode: text("job_code").notNull(),
  status: text("status").notNull(), // "RUNNING", "COMPLETED", "FAILED", "TIMED_OUT"
  startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
  completedAt: integer("completed_at", { mode: "timestamp_ms" }),
  durationMs: integer("duration_ms"),
  recordsProcessed: integer("records_processed"),
  outputMessage: text("output_message"),
  errorMessage: text("error_message"),
  triggeredBy: text("triggered_by").notNull().default("SCHEDULER"), // "SCHEDULER" | "MANUAL"
});

// ── Job Run Logs ──────────────────────────────────────────
export const schedulerJobRunLogs = sqliteTable("scheduler_job_run_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jobRunId: integer("job_run_id").notNull(),
  level: text("level").notNull(), // "INFO", "WARN", "ERROR"
  message: text("message").notNull(),
  loggedAt: integer("logged_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

// ── Event Queue ───────────────────────────────────────────
export const eventQueue = sqliteTable("event_queue", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  eventType: text("event_type").notNull(),
  status: text("status").notNull().default("RECEIVED"), // "RECEIVED", "PROCESSING", "PROCESSED", "FAILED"
  payload: text("payload").notNull(), // JSON
  receivedAt: integer("received_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  processingStartedAt: integer("processing_started_at", { mode: "timestamp_ms" }),
  processedAt: integer("processed_at", { mode: "timestamp_ms" }),
  retryCount: integer("retry_count").notNull().default(0),
  maxRetries: integer("max_retries").notNull().default(3),
  nextRetryAt: integer("next_retry_at", { mode: "timestamp_ms" }),
  errorMessage: text("error_message"),
  outputMessage: text("output_message"),
});
