/**
 * SMS delivery via Twilio.
 * Sends top 3 headlines in a compact format.
 */

import { db } from "../../db/index.js";
import { config } from "../../db/schema.js";
import { eq } from "drizzle-orm";

interface SmsHeadline {
  title: string;
  url: string;
}

/**
 * Send a digest of headlines via SMS.
 */
export async function sendSmsDigest(headlines: SmsHeadline[]): Promise<boolean> {
  const phone = getConfig("phone");
  const twilioSid = getConfig("twilio_account_sid") || process.env.TWILIO_ACCOUNT_SID;
  const twilioToken = getConfig("twilio_auth_token") || process.env.TWILIO_AUTH_TOKEN;
  const twilioFrom = getConfig("twilio_phone_number") || process.env.TWILIO_PHONE_NUMBER;

  if (!phone) {
    console.warn("[sms] No phone number configured — skipping SMS");
    return false;
  }

  if (!twilioSid || !twilioToken || !twilioFrom) {
    console.warn("[sms] Twilio not configured — skipping SMS");
    return false;
  }

  // Take top 3 headlines (SMS character limit)
  const top3 = headlines.slice(0, 3);

  const body = formatSmsBody(top3);

  try {
    const twilio = await import("twilio");
    const client = twilio.default(twilioSid, twilioToken);

    await client.messages.create({
      body,
      to: phone,
      from: twilioFrom,
    });

    console.log(`[sms] Digest sent to ${phone} (${top3.length} headlines)`);
    return true;
  } catch (err) {
    console.error("[sms] Failed to send:", (err as Error).message);
    return false;
  }
}

function formatSmsBody(headlines: SmsHeadline[]): string {
  const lines = headlines.map((h, i) => `${i + 1}. ${h.title}\n${h.url}`);

  return `MyHeadlines Daily\n\n${lines.join("\n\n")}`;
}

function getConfig(key: string): string | undefined {
  const row = db.select().from(config).where(eq(config.key, key)).get();
  return row?.value;
}
