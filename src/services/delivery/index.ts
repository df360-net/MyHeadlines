/**
 * Digest delivery orchestrator.
 * Selects top headlines, sends via SMS + email, records the digest.
 */

import { nanoid } from "nanoid";
import { db } from "../../db/index.js";
import { digestSends } from "../../db/schema.js";
import { getTopHeadlines, scoreAllHeadlines } from "../interests/index.js";
import { sendSmsDigest } from "./sms.js";
import { sendEmailDigest } from "./email.js";

/**
 * Generate and send the daily digest via all configured channels.
 */
export async function sendDailyDigest(): Promise<{
  sms: boolean;
  email: boolean;
  headlineCount: number;
}> {
  console.log("[digest] Preparing daily digest...");

  // Re-score before selecting headlines
  scoreAllHeadlines();

  // Get top headlines (80% relevant + 20% exploration)
  const top = getTopHeadlines(15);

  if (top.length === 0) {
    console.log("[digest] No headlines available — skipping digest");
    return { sms: false, email: false, headlineCount: 0 };
  }

  console.log(`[digest] Selected ${top.length} headlines for digest`);

  // Send via SMS (top 3 only)
  const smsResult = await sendSmsDigest(
    top.slice(0, 3).map((h) => ({
      title: h.title,
      url: h.url,
    }))
  );

  // Send via email (all headlines)
  const emailResult = await sendEmailDigest(
    top.map((h) => ({
      title: h.title,
      url: h.url,
      summary: h.summary,
      topics: h.topics,
      sourceName: h.sourceName,
    }))
  );

  // Record the digest send
  db.insert(digestSends)
    .values({
      id: nanoid(12),
      headlineIds: JSON.stringify(top.map((h) => h.id)),
      channel: [smsResult ? "sms" : null, emailResult ? "email" : null]
        .filter(Boolean)
        .join(",") || "none",
      sentAt: new Date(),
    })
    .run();

  console.log(
    `[digest] Complete — SMS: ${smsResult ? "sent" : "skipped"}, Email: ${emailResult ? "sent" : "skipped"}`
  );

  return {
    sms: smsResult,
    email: emailResult,
    headlineCount: top.length,
  };
}
