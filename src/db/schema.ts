import { sqliteTable, text, real, integer } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// ── Config (key-value store for settings) ─────────────────
export const config = sqliteTable("config", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

// ── Topics (canonical topic registry) ─────────────────────
export const topics = sqliteTable("topics", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  slug: text("slug").notNull().unique(),
  displayName: text("display_name").notNull(),
  isFixed: integer("is_fixed").notNull().default(0),
  sortOrder: integer("sort_order").notNull().default(999),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

// ── User interests (the learned model) ────────────────────
export const userInterests = sqliteTable("user_interests", {
  id: text("id").primaryKey(),
  topicId: integer("topic_id"),           // FK to topics.id
  /** @deprecated Use topicId instead. Kept only for backward-compat migration; do not read in new code. */
  topic: text("topic").notNull(),
  rawWeight: real("raw_weight").notNull().default(0.5),
  confidence: real("confidence").notNull().default(0.0),
  source: text("source").notNull(), // "bookmark" | "history" | "click" | "explicit"
  interactionCount: integer("interaction_count").notNull().default(0),
  lastInteraction: integer("last_interaction", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

// ── Headlines fetched from sources ────────────────────────
export const headlines = sqliteTable("headlines", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  url: text("url").notNull(),
  summary: text("summary"),
  topicIds: text("topic_ids"),                    // JSON array of topic IDs: [1,5,12]
  categoryId: integer("category_id"),             // FK to topics.id
  /** @deprecated Use topicIds instead. Kept only for backward-compat migration; do not read in new code. */
  topics: text("topics").notNull(),
  /** @deprecated Use categoryId instead. Kept only for backward-compat migration; do not read in new code. */
  category: text("category"),
  sourceRss: text("source_rss"),
  sourceName: text("source_name"),
  publishedAt: integer("published_at", { mode: "timestamp_ms" }),
  fetchedAt: integer("fetched_at", { mode: "timestamp_ms" }).notNull(),
  score: real("score"),
  feedback: text("feedback"), // "up" | "down" | null
});

// ── Tracked links (for email/SMS redirect tracking) ───────
export const trackedLinks = sqliteTable("tracked_links", {
  trackingId: text("tracking_id").primaryKey(),
  headlineId: text("headline_id").notNull(),
  destinationUrl: text("destination_url").notNull(),
  channel: text("channel").notNull(), // "email" | "sms" | "web"
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

// ── Click events (raw signal data) ────────────────────────
export const clickEvents = sqliteTable("click_events", {
  id: text("id").primaryKey(),
  headlineId: text("headline_id").notNull(),
  trackingId: text("tracking_id"),
  channel: text("channel").notNull(), // "email" | "sms" | "web"
  clickedAt: integer("clicked_at", { mode: "timestamp_ms" }).notNull(),
});

// ── Digest sends (what we showed the user) ────────────────
export const digestSends = sqliteTable("digest_sends", {
  id: text("id").primaryKey(),
  headlineIds: text("headline_ids").notNull(), // JSON array of headline IDs
  channel: text("channel").notNull(), // "email" | "sms"
  sentAt: integer("sent_at", { mode: "timestamp_ms" }).notNull(),
});

// ── Imported URLs (from browser scan) ─────────────────────
export const importedUrls = sqliteTable("imported_urls", {
  id: text("id").primaryKey(),
  url: text("url").notNull(),
  title: text("title"),
  domain: text("domain"),
  visitCount: integer("visit_count"),
  extractedTopics: text("extracted_topics"), // JSON array
  source: text("source").notNull(), // "bookmark" | "history" | "app" | "document"
  importedAt: integer("imported_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});
