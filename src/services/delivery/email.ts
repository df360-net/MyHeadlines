/**
 * Email delivery via Amazon SES (primary) or Resend (fallback).
 * Sends formatted HTML digests and briefings.
 */

import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { db } from "../../db/index.js";
import { config } from "../../db/schema.js";
import { eq } from "drizzle-orm";

// Built-in keys — injected at compile time via --define flag.
// Users can override by setting keys in Settings.
declare const __BUILTIN_RESEND_KEY__: string;
declare const __BUILTIN_AWS_ACCESS_KEY_ID__: string;
declare const __BUILTIN_AWS_SECRET_ACCESS_KEY__: string;
declare const __BUILTIN_AWS_REGION__: string;

const BUILTIN_RESEND_KEY = typeof __BUILTIN_RESEND_KEY__ !== "undefined" ? __BUILTIN_RESEND_KEY__ : "";
const BUILTIN_AWS_ACCESS_KEY_ID = typeof __BUILTIN_AWS_ACCESS_KEY_ID__ !== "undefined" ? __BUILTIN_AWS_ACCESS_KEY_ID__ : "";
const BUILTIN_AWS_SECRET_ACCESS_KEY = typeof __BUILTIN_AWS_SECRET_ACCESS_KEY__ !== "undefined" ? __BUILTIN_AWS_SECRET_ACCESS_KEY__ : "";
const BUILTIN_AWS_REGION = typeof __BUILTIN_AWS_REGION__ !== "undefined" ? __BUILTIN_AWS_REGION__ : "us-east-1";

const DEFAULT_FROM_ADDRESS = "MyHeadlines <myheadlines@df360.net>";

function getFromAddress(): string {
  const custom = getConfig("digest_sender_address");
  return custom || DEFAULT_FROM_ADDRESS;
}

interface EmailHeadline {
  title: string;
  url: string;
  summary: string | null;
  topics: string;
  sourceName: string | null;
}

// ── Core send function (SES primary, Resend fallback) ────

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  // Try SES first
  const awsKeyId = getConfig("aws_access_key_id") || BUILTIN_AWS_ACCESS_KEY_ID;
  const awsSecret = getConfig("aws_secret_access_key") || BUILTIN_AWS_SECRET_ACCESS_KEY;
  const awsRegion = getConfig("aws_region") || BUILTIN_AWS_REGION;

  if (awsKeyId && awsSecret) {
    try {
      const client = new SESv2Client({
        region: awsRegion,
        credentials: { accessKeyId: awsKeyId, secretAccessKey: awsSecret },
      });

      await client.send(new SendEmailCommand({
        FromEmailAddress: getFromAddress(),
        Destination: { ToAddresses: [to] },
        Content: {
          Simple: {
            Subject: { Data: subject, Charset: "UTF-8" },
            Body: {
              Html: { Data: html, Charset: "UTF-8" },
              Text: { Data: subject, Charset: "UTF-8" },
            },
          },
        },
      }));

      console.log(`[email] Sent via SES to ${to}`);
      return true;
    } catch (err) {
      console.error("[email] SES failed:", (err as Error).message);
      // Fall through to Resend
    }
  }

  // Fallback: Resend
  const resendKey = getConfig("resend_api_key") || BUILTIN_RESEND_KEY;
  if (!resendKey) {
    console.warn("[email] No email service configured (no SES credentials, no Resend key) — skipping");
    return false;
  }

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(resendKey);

    await resend.emails.send({
      from: getFromAddress(),
      to,
      subject,
      html,
      headers: { "Date": new Date().toUTCString() },
    });

    console.log(`[email] Sent via Resend to ${to}`);
    return true;
  } catch (err) {
    console.error("[email] Resend failed:", (err as Error).message);
    return false;
  }
}

// ── Public API ───────────────────────────────────────────

/**
 * Send a digest of headlines via email.
 */
export async function sendEmailDigest(headlines: EmailHeadline[]): Promise<boolean> {
  const email = getConfig("email");
  if (!email) {
    console.warn("[email] No email address configured — skipping email");
    return false;
  }

  const html = buildEmailHtml(headlines);
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const sent = await sendEmail(email, `Your Morning Digest — ${today}`, html);
  if (sent) console.log(`[email] Digest sent to ${email} (${headlines.length} headlines)`);
  return sent;
}

/**
 * Send the daily briefing via email.
 */
export async function sendBriefingEmail(briefing: {
  categories: Array<{
    category: string;
    headlines: Array<{ title: string; url: string; summary: string }>;
  }>;
}): Promise<boolean> {
  const email = getConfig("email");
  if (!email) {
    console.warn("[email] No email address configured — skipping briefing email");
    return false;
  }

  const html = buildBriefingEmailHtml(briefing.categories);
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const sent = await sendEmail(email, `Your Daily Briefing — ${today}`, html);
  if (sent) console.log(`[email] Briefing sent to ${email}`);
  return sent;
}

// ── HTML builders ────────────────────────────────────────

function buildEmailHtml(headlines: EmailHeadline[]): string {
  const headlineRows = headlines
    .map((h) => {
      let topics = "";
      try {
        const parsed = JSON.parse(h.topics) as string[];
        topics = parsed
          .slice(0, 3)
          .map(
            (t) =>
              `<span style="display:inline-block;background:#e8f0fe;color:#1a73e8;font-size:11px;padding:2px 8px;border-radius:12px;margin-right:4px;">${t}</span>`
          )
          .join("");
      } catch {
        // ignore
      }

      const summary = h.summary
        ? `<p style="color:#666;margin:4px 0 0 0;font-size:14px;line-height:1.4;">${escapeHtml(h.summary.slice(0, 200))}</p>`
        : "";

      const source = h.sourceName
        ? `<span style="color:#999;font-size:12px;">${escapeHtml(h.sourceName)}</span>`
        : "";

      return `
        <tr>
          <td style="padding:16px 0;border-bottom:1px solid #eee;">
            <a href="${escapeHtml(h.url)}" style="color:#1a1a1a;text-decoration:none;font-size:16px;font-weight:600;line-height:1.3;">
              ${escapeHtml(h.title)}
            </a>
            ${summary}
            <div style="margin-top:8px;">
              ${source}
              ${topics ? `<span style="margin-left:8px;">${topics}</span>` : ""}
              <a href="${escapeHtml(h.url)}" style="color:#1a73e8;text-decoration:none;font-weight:600;font-size:12px;margin-left:8px;">Read full article &rarr;</a>
            </div>
          </td>
        </tr>`;
    })
    .join("");

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;">
    <tr>
      <td align="center" style="padding:20px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:8px;overflow:hidden;">
          <!-- Header -->
          <tr>
            <td style="background:#1a73e8;padding:24px 24px 20px;">
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">MyHeadlines</h1>
              <p style="margin:4px 0 0 0;color:#c5d9f7;font-size:14px;">Your morning digest</p>
            </td>
          </tr>
          <!-- Headlines -->
          <tr>
            <td style="padding:8px 24px 24px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                ${headlineRows}
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:16px 24px;background:#fafafa;border-top:1px solid #eee;">
              <p style="margin:0;color:#999;font-size:12px;text-align:center;">
                Curated by MyHeadlines based on your interests
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildBriefingEmailHtml(
  categories: Array<{
    category: string;
    headlines: Array<{ title: string; url: string; summary: string }>;
  }>
): string {
  const categoryBlocks = categories
    .map((cat) => {
      const headlineRows = cat.headlines
        .map(
          (h) => `
            <tr>
              <td style="padding:12px 0;border-bottom:1px solid #f0f0f0;">
                <a href="${escapeHtml(h.url)}" style="color:#1a1a1a;text-decoration:none;font-size:15px;font-weight:600;line-height:1.3;">
                  ${escapeHtml(h.title)}
                </a>
                <p style="color:#555;margin:6px 0 0 0;font-size:14px;line-height:1.5;">
                  ${escapeHtml(h.summary)}
                  <a href="${escapeHtml(h.url)}" style="color:#1a73e8;text-decoration:none;font-weight:600;font-size:13px;"> Read full article &rarr;</a>
                </p>
              </td>
            </tr>`
        )
        .join("");

      return `
        <tr>
          <td style="padding:20px 0 8px;">
            <h2 style="margin:0;font-size:16px;font-weight:700;color:#1a73e8;text-transform:uppercase;letter-spacing:0.5px;">${escapeHtml(cat.category)}</h2>
          </td>
        </tr>
        ${headlineRows}`;
    })
    .join("");

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;">
    <tr>
      <td align="center" style="padding:20px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:8px;overflow:hidden;">
          <tr>
            <td style="background:#1a73e8;padding:24px 24px 20px;">
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">MyHeadlines</h1>
              <p style="margin:4px 0 0 0;color:#c5d9f7;font-size:14px;">Your Daily Briefing</p>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 24px 24px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                ${categoryBlocks}
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px;background:#fafafa;border-top:1px solid #eee;">
              <p style="margin:0;color:#999;font-size:12px;text-align:center;">
                AI-curated by MyHeadlines based on your interests
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getConfig(key: string): string | undefined {
  const row = db.select().from(config).where(eq(config.key, key)).get();
  return row?.value;
}
