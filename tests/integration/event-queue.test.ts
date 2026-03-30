import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "../fixtures/db.js";
import { Database } from "bun:sqlite";

let testSqlite: Database;
let testDb: ReturnType<typeof createTestDb>["db"];

vi.mock("../../src/db/index.js", () => ({
  get db() { return testDb; },
  get sqlite() { return testSqlite; },
}));

import {
  enqueueEvent,
  processEventBatch,
  recoverStalledEvents,
  registerEventHandler,
} from "../../src/scheduler/events.js";

describe("event queue", () => {
  beforeEach(() => {
    const result = createTestDb();
    testDb = result.db;
    testSqlite = result.sqlite;
  });

  describe("enqueueEvent", () => {
    it("inserts event with RECEIVED status", () => {
      enqueueEvent("TEST_EVENT", { key: "value" });
      const row = testSqlite.prepare("SELECT * FROM event_queue WHERE event_type = 'TEST_EVENT'").get() as any;
      expect(row).toBeTruthy();
      expect(row.status).toBe("RECEIVED");
      expect(JSON.parse(row.payload)).toEqual({ key: "value" });
    });

    it("sets max_retries from parameter", () => {
      enqueueEvent("RETRY_EVENT", {}, 5);
      const row = testSqlite.prepare("SELECT * FROM event_queue WHERE event_type = 'RETRY_EVENT'").get() as any;
      expect(row.max_retries).toBe(5);
    });
  });

  describe("processEventBatch", () => {
    it("processes events with registered handlers", async () => {
      registerEventHandler("GREET", async (_type, payload) => {
        return `Hello ${(payload as any).name}`;
      });

      enqueueEvent("GREET", { name: "World" });
      const processed = await processEventBatch();
      expect(processed).toBe(1);

      const row = testSqlite.prepare("SELECT * FROM event_queue WHERE event_type = 'GREET'").get() as any;
      expect(row.status).toBe("PROCESSED");
      expect(row.output_message).toBe("Hello World");
    });

    it("marks events FAILED when no handler registered", async () => {
      enqueueEvent("UNKNOWN_EVENT", {});
      await processEventBatch();

      const row = testSqlite.prepare("SELECT * FROM event_queue WHERE event_type = 'UNKNOWN_EVENT'").get() as any;
      expect(row.status).toBe("FAILED");
      expect(row.error_message).toContain("No handler registered");
    });

    it("retries failed events with exponential backoff", async () => {
      registerEventHandler("FLAKY", async () => {
        throw new Error("Temporary failure");
      });

      enqueueEvent("FLAKY", {}, 3);
      await processEventBatch();

      const row = testSqlite.prepare("SELECT * FROM event_queue WHERE event_type = 'FLAKY'").get() as any;
      expect(row.status).toBe("RECEIVED"); // back to RECEIVED for retry
      expect(row.retry_count).toBe(1);
      expect(row.next_retry_at).not.toBeNull();
    });

    it("marks event FAILED after max retries exceeded", async () => {
      registerEventHandler("DOOMED", async () => {
        throw new Error("Always fails");
      });

      enqueueEvent("DOOMED", {}, 1); // max 1 retry
      await processEventBatch();

      const row = testSqlite.prepare("SELECT * FROM event_queue WHERE event_type = 'DOOMED'").get() as any;
      expect(row.status).toBe("FAILED");
      expect(row.retry_count).toBe(1);
    });

    it("returns 0 when no events pending", async () => {
      const processed = await processEventBatch();
      expect(processed).toBe(0);
    });
  });

  describe("recoverStalledEvents", () => {
    it("recovers events stuck in PROCESSING", () => {
      // Insert a stalled event (processing started 20 minutes ago)
      testSqlite.prepare(
        "INSERT INTO event_queue (event_type, status, payload, received_at, processing_started_at, max_retries) VALUES (?, ?, ?, ?, ?, ?)"
      ).run("STALLED", "PROCESSING", '{}', Date.now() - 1200000, Date.now() - 1200000, 3);

      const recovered = recoverStalledEvents(10);
      expect(recovered).toBe(1);

      const row = testSqlite.prepare("SELECT * FROM event_queue WHERE event_type = 'STALLED'").get() as any;
      expect(row.status).toBe("RECEIVED");
      expect(row.retry_count).toBe(1);
    });

    it("marks stalled events FAILED when max retries exceeded", () => {
      testSqlite.prepare(
        "INSERT INTO event_queue (event_type, status, payload, received_at, processing_started_at, retry_count, max_retries) VALUES (?, ?, ?, ?, ?, ?, ?)"
      ).run("STALLED_MAX", "PROCESSING", '{}', Date.now() - 1200000, Date.now() - 1200000, 2, 2);

      recoverStalledEvents(10);

      const row = testSqlite.prepare("SELECT * FROM event_queue WHERE event_type = 'STALLED_MAX'").get() as any;
      expect(row.status).toBe("FAILED");
    });

    it("does not recover recently started events", () => {
      testSqlite.prepare(
        "INSERT INTO event_queue (event_type, status, payload, received_at, processing_started_at, max_retries) VALUES (?, ?, ?, ?, ?, ?)"
      ).run("FRESH", "PROCESSING", '{}', Date.now(), Date.now(), 3);

      const recovered = recoverStalledEvents(10);
      expect(recovered).toBe(0);
    });
  });
});
