/**
 * Event Queue — async event processing with retries and exponential backoff.
 * Modeled after AskSQL's event dispatcher.
 */

import { db } from "../db/index.js";
import { eventQueue } from "../db/schema-scheduler.js";
import { eq, sql } from "drizzle-orm";

type EventHandler = (eventType: string, payload: unknown) => Promise<string | void>;

const handlers = new Map<string, EventHandler>();

/**
 * Register an event handler for a specific event type.
 */
export function registerEventHandler(eventType: string, handler: EventHandler) {
  handlers.set(eventType, handler);
}

/**
 * Enqueue an event for async processing.
 */
export function enqueueEvent(
  eventType: string,
  payload: Record<string, unknown>,
  maxRetries: number = 3
) {
  db.insert(eventQueue)
    .values({
      eventType,
      status: "RECEIVED",
      payload: JSON.stringify(payload),
      receivedAt: new Date(),
      maxRetries,
    })
    .run();
}

/**
 * Process a batch of pending events.
 * Called by the PROCESS_EVENT_QUEUE job.
 */
export async function processEventBatch(maxCount: number = 20): Promise<number> {
  const now = Date.now();

  // Claim events: RECEIVED and ready for processing (retry delay passed)
  const pending = db
    .select()
    .from(eventQueue)
    .where(
      sql`${eventQueue.status} = 'RECEIVED'
          AND (${eventQueue.nextRetryAt} IS NULL OR ${eventQueue.nextRetryAt} <= ${now})`
    )
    .orderBy(eventQueue.receivedAt)
    .limit(maxCount)
    .all();

  if (pending.length === 0) return 0;

  // Atomically claim events — only update if still RECEIVED (prevents double-processing)
  const claimed = [];
  for (const event of pending) {
    const result = db.update(eventQueue)
      .set({
        status: "PROCESSING",
        processingStartedAt: new Date(now),
      })
      .where(sql`${eventQueue.id} = ${event.id} AND ${eventQueue.status} = 'RECEIVED'`)
      .run() as unknown as { changes: number };
    if (result.changes > 0) claimed.push(event);
  }
  if (claimed.length === 0) return 0;
  const pending_claimed = claimed;

  // Process each event
  let processed = 0;
  for (const event of pending_claimed) {
    const handler = handlers.get(event.eventType);

    if (!handler) {
      db.update(eventQueue)
        .set({
          status: "FAILED",
          processedAt: new Date(),
          errorMessage: `No handler registered for event type: ${event.eventType}`,
        })
        .where(eq(eventQueue.id, event.id))
        .run();
      continue;
    }

    try {
      let payload: unknown;
      try {
        payload = JSON.parse(event.payload);
      } catch {
        payload = event.payload;
      }

      const outputMessage = await handler(event.eventType, payload);

      db.update(eventQueue)
        .set({
          status: "PROCESSED",
          processedAt: new Date(),
          outputMessage: outputMessage || "OK",
        })
        .where(eq(eventQueue.id, event.id))
        .run();

      processed++;
    } catch (err) {
      const errorMsg = (err as Error).message;
      const newRetryCount = event.retryCount + 1;

      if (newRetryCount >= event.maxRetries) {
        // Dead letter — max retries exceeded
        db.update(eventQueue)
          .set({
            status: "FAILED",
            processedAt: new Date(),
            retryCount: newRetryCount,
            errorMessage: errorMsg,
          })
          .where(eq(eventQueue.id, event.id))
          .run();
      } else {
        // Schedule retry with exponential backoff: 2^retry minutes
        const backoffMs = Math.pow(2, newRetryCount) * 60 * 1000;
        db.update(eventQueue)
          .set({
            status: "RECEIVED",
            retryCount: newRetryCount,
            nextRetryAt: new Date(Date.now() + backoffMs),
            errorMessage: errorMsg,
          })
          .where(eq(eventQueue.id, event.id))
          .run();
      }
    }
  }

  return processed;
}

/**
 * Recover stalled events (stuck in PROCESSING for too long).
 */
export function recoverStalledEvents(thresholdMinutes: number = 10): number {
  const threshold = Date.now() - thresholdMinutes * 60 * 1000;

  const stalled = db
    .select()
    .from(eventQueue)
    .where(
      sql`${eventQueue.status} = 'PROCESSING'
          AND ${eventQueue.processingStartedAt} < ${threshold}`
    )
    .all();

  for (const event of stalled) {
    const newRetryCount = event.retryCount + 1;

    if (newRetryCount >= event.maxRetries) {
      // Max retries exceeded — mark as FAILED instead of retrying forever
      db.update(eventQueue)
        .set({
          status: "FAILED",
          processedAt: new Date(),
          retryCount: newRetryCount,
          errorMessage: "Max retries exceeded (stalled in PROCESSING)",
        })
        .where(eq(eventQueue.id, event.id))
        .run();
    } else {
      const backoffMs = Math.pow(2, newRetryCount) * 60 * 1000;
      db.update(eventQueue)
        .set({
          status: "RECEIVED",
          retryCount: newRetryCount,
          nextRetryAt: new Date(Date.now() + backoffMs),
          errorMessage: "Recovered from stalled PROCESSING state",
        })
        .where(eq(eventQueue.id, event.id))
        .run();
    }
  }

  return stalled.length;
}
