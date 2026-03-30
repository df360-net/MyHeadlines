import { sqlite } from "./index.js";

const FIXED_TOPICS = [
  { slug: "politics", displayName: "Politics", sortOrder: 1 },
  { slug: "world", displayName: "World", sortOrder: 2 },
  { slug: "finance", displayName: "Finance", sortOrder: 3 },
  { slug: "travel", displayName: "Travel", sortOrder: 4 },
  { slug: "health", displayName: "Health", sortOrder: 5 },
  { slug: "sports", displayName: "Sports", sortOrder: 6 },
  { slug: "entertainment", displayName: "Entertainment", sortOrder: 7 },
];

const COMMON_TOPICS = [
  { slug: "technology", displayName: "Technology", sortOrder: 100 },
  { slug: "business", displayName: "Business", sortOrder: 101 },
  { slug: "science", displayName: "Science", sortOrder: 102 },
  { slug: "general", displayName: "General", sortOrder: 103 },
];

/**
 * Run database migrations.
 * Creates all tables and indexes if they don't exist.
 */
export function runMigrations() {
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
      topics TEXT NOT NULL,
      category TEXT,
      source_rss TEXT,
      source_name TEXT,
      published_at INTEGER,
      fetched_at INTEGER NOT NULL,
      score REAL,
      feedback TEXT
    );

    CREATE TABLE IF NOT EXISTS tracked_links (
      tracking_id TEXT PRIMARY KEY,
      headline_id TEXT NOT NULL,
      destination_url TEXT NOT NULL,
      channel TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
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

    -- Indexes (legacy idx_user_interests_topic replaced by idx_user_interests_topic_id below)

    CREATE INDEX IF NOT EXISTS idx_click_events_clicked
      ON click_events(clicked_at);

    CREATE INDEX IF NOT EXISTS idx_headlines_fetched
      ON headlines(fetched_at);

    CREATE INDEX IF NOT EXISTS idx_headlines_score
      ON headlines(score);

    CREATE INDEX IF NOT EXISTS idx_digest_sends_sent
      ON digest_sends(sent_at);

    -- FTS5 full-text search on headlines
    CREATE VIRTUAL TABLE IF NOT EXISTS headlines_fts
      USING fts5(title, summary);

    -- Scheduler tables
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

    -- Scheduler indexes
    CREATE INDEX IF NOT EXISTS idx_sched_jobs_enabled_next
      ON scheduler_jobs(is_enabled, next_run_at);

    CREATE INDEX IF NOT EXISTS idx_sched_runs_job
      ON scheduler_job_runs(job_id, started_at);

    CREATE INDEX IF NOT EXISTS idx_sched_run_logs_run
      ON scheduler_job_run_logs(job_run_id);

    CREATE INDEX IF NOT EXISTS idx_event_queue_status
      ON event_queue(status, next_retry_at);
  `);

  // Drop stale legacy index (replaced by idx_user_interests_topic_id)
  sqlite.exec(`DROP INDEX IF EXISTS idx_user_interests_topic`);

  // ── Topic ID migration ──────────────────────────────────
  migrateTopicIds();

  console.log("[db] Migrations complete.");
}

/**
 * Migrate string-based topics to ID-based references.
 * Safe to run multiple times — all operations are idempotent.
 */
function migrateTopicIds() {
  // 1. Add new columns if they don't exist (ALTER TABLE is not idempotent, so check first)
  const headlineCols = sqlite.query("PRAGMA table_info(headlines)").all() as Array<{ name: string }>;
  const headlineColNames = new Set(headlineCols.map((c) => c.name));
  if (!headlineColNames.has("category_id")) {
    sqlite.exec(`ALTER TABLE headlines ADD COLUMN category_id INTEGER`);
    sqlite.exec(`ALTER TABLE headlines ADD COLUMN topic_ids TEXT`);
  }

  const interestCols = sqlite.query("PRAGMA table_info(user_interests)").all() as Array<{ name: string }>;
  const interestColNames = new Set(interestCols.map((c) => c.name));
  if (!interestColNames.has("topic_id")) {
    sqlite.exec(`ALTER TABLE user_interests ADD COLUMN topic_id INTEGER`);
  }

  // 2. Seed fixed + common topics
  const insertTopic = sqlite.prepare(
    `INSERT OR IGNORE INTO topics (slug, display_name, is_fixed, sort_order) VALUES (?, ?, ?, ?)`
  );
  for (const t of FIXED_TOPICS) {
    insertTopic.run(t.slug, t.displayName, 1, t.sortOrder);
  }
  for (const t of COMMON_TOPICS) {
    insertTopic.run(t.slug, t.displayName, 0, t.sortOrder);
  }

  // 3. Collect all distinct slugs from existing data and ensure they're in topics table
  const getOrCreateTopic = sqlite.prepare(
    `INSERT OR IGNORE INTO topics (slug, display_name, is_fixed, sort_order) VALUES (?, ?, 0, 999)`
  );
  const getTopicId = sqlite.prepare(`SELECT id FROM topics WHERE slug = ?`);

  // Helper: slug → id (creates if needed)
  function resolve(slug: string): number | null {
    if (!slug) return null;
    const clean = slug.toLowerCase().trim();
    if (!clean) return null;
    // Title-case for display
    const display = clean.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
    getOrCreateTopic.run(clean, display);
    const row = getTopicId.get(clean) as { id: number } | undefined;
    return row?.id ?? null;
  }

  // 4. Backfill headlines (only rows where category_id is NULL)
  const unmigratedHeadlines = sqlite.prepare(
    `SELECT id, category, topics FROM headlines WHERE category_id IS NULL`
  ).all() as Array<{ id: string; category: string | null; topics: string }>;

  if (unmigratedHeadlines.length > 0) {
    const updateHeadline = sqlite.prepare(
      `UPDATE headlines SET category_id = ?, topic_ids = ? WHERE id = ?`
    );

    const batchUpdate = sqlite.transaction(() => {
      for (const h of unmigratedHeadlines) {
        const catId = h.category ? resolve(h.category) : null;

        let topicIdArr: number[] = [];
        try {
          const slugs = JSON.parse(h.topics) as string[];
          topicIdArr = slugs.map((s) => resolve(s)).filter((id): id is number => id !== null);
        } catch { /* ignore */ }

        updateHeadline.run(catId, JSON.stringify(topicIdArr), h.id);
      }
    });
    batchUpdate();
    console.log(`[db] Backfilled ${unmigratedHeadlines.length} headlines with topic IDs`);
  }

  // 5. Backfill user_interests (only rows where topic_id is NULL)
  const unmigratedInterests = sqlite.prepare(
    `SELECT id, topic FROM user_interests WHERE topic_id IS NULL`
  ).all() as Array<{ id: string; topic: string }>;

  if (unmigratedInterests.length > 0) {
    const updateInterest = sqlite.prepare(
      `UPDATE user_interests SET topic_id = ? WHERE id = ?`
    );
    for (const i of unmigratedInterests) {
      const topicId = resolve(i.topic);
      if (topicId) updateInterest.run(topicId, i.id);
    }
    console.log(`[db] Backfilled ${unmigratedInterests.length} interests with topic IDs`);
  }

  // 6. Create indexes on new columns
  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_headlines_category_id ON headlines(category_id);
    CREATE INDEX IF NOT EXISTS idx_user_interests_topic_id ON user_interests(topic_id);
  `);
}
