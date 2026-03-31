/**
 * All MyHeadlines scheduled jobs.
 * Each job follows the AskSQL pattern: meta + execute function.
 */

import { registerJob, registerClusteredJob } from "./registry.js";
import { processEventBatch, recoverStalledEvents } from "./events.js";
import { refreshHeadlines, cleanupOldHeadlines } from "../services/news/index.js";
import { searchNewsByInterests } from "../services/news/interest-search.js";
import { scoreAllHeadlines, getTopHeadlines } from "../services/interests/index.js";
import { generateDailyBriefing } from "../services/ai/briefing.js";
import { sendBriefingEmail, sendEmailDigest } from "../services/delivery/email.js";
import { refreshProfile } from "../services/ai/profile-refresh.js";
import type { JobMeta, JobFn } from "./types.js";

const HEADLINE_RETENTION_DAYS = 4;

// ── FETCH_ALL_NEWS (clustered) ───────────────────────────
const fetchAllNewsMeta: JobMeta = {
  code: "FETCH_ALL_NEWS",
  name: "Fetch All News",
  description: "Discover personal feeds, fetch headlines from all sources, and enrich with AI topics.",
  groupCode: "FETCH",
  defaultIntervalSeconds: 3600, // 1 hour
  defaultTimeoutSeconds: 300, // 5 minutes — feed discovery + fetch + enrichment
};

// ── SCORE_HEADLINES ───────────────────────────────────────
const scoreHeadlinesMeta: JobMeta = {
  code: "SCORE_HEADLINES",
  name: "Score Headlines",
  description: "Re-score all headlines against the user's interest model. Picks up interest changes from clicks and feedback.",
  groupCode: "SCORING",
  defaultIntervalSeconds: 900, // 15 minutes
  defaultTimeoutSeconds: 30,
};

const scoreHeadlinesExecute: JobFn = async (ctx) => {
  const scored = scoreAllHeadlines();
  return {
    recordsProcessed: scored,
    outputMessage: `${scored} headlines scored`,
  };
};

// ── SEND_MORNING_DIGEST ──────────────────────────────────
const sendMorningDigestMeta: JobMeta = {
  code: "SEND_MORNING_DIGEST",
  name: "Morning Digest",
  description: "Select top personalized headlines and email them to start your day.",
  groupCode: "DELIVERY",
  defaultIntervalSeconds: 86400, // 24 hours
  defaultTimeoutSeconds: 60,
  defaultDailyRunTime: "07:00",
};

// ── PROCESS_EVENT_QUEUE ──────────────────────────────────
const processEventsMeta: JobMeta = {
  code: "PROCESS_EVENT_QUEUE",
  name: "Process Event Queue",
  description: "Process pending events (clicks, feedback) with retry support.",
  groupCode: "MAINTENANCE",
  defaultIntervalSeconds: 10, // every 10 seconds
  defaultTimeoutSeconds: 30,
};

const processEventsExecute: JobFn = async (ctx) => {
  const processed = await processEventBatch(50);
  if (processed > 0) {
    ctx.log("INFO", `${processed} events processed`);
  }
  return {
    recordsProcessed: processed,
    outputMessage: `${processed} events processed`,
  };
};

// ── RECOVER_STALLED_EVENTS ───────────────────────────────
const recoverStalledMeta: JobMeta = {
  code: "RECOVER_STALLED_EVENTS",
  name: "Recover Stalled Events",
  description: "Reset events stuck in PROCESSING state for more than 10 minutes.",
  groupCode: "MAINTENANCE",
  defaultIntervalSeconds: 300, // 5 minutes
  defaultTimeoutSeconds: 30,
};

const recoverStalledExecute: JobFn = async (ctx) => {
  const recovered = recoverStalledEvents(10);
  if (recovered > 0) {
    ctx.log("WARN", `${recovered} stalled events recovered`);
  }
  return {
    recordsProcessed: recovered,
    outputMessage: `${recovered} stalled events recovered`,
  };
};

// ── CLEANUP_OLD_HEADLINES ────────────────────────────────
const cleanupMeta: JobMeta = {
  code: "CLEANUP_OLD_HEADLINES",
  name: "Cleanup Old Headlines",
  description: `Remove headlines older than ${HEADLINE_RETENTION_DAYS} days to keep the database lean.`,
  groupCode: "MAINTENANCE",
  defaultIntervalSeconds: 86400, // daily
  defaultTimeoutSeconds: 60,
  defaultDailyRunTime: "03:00",
};

const cleanupExecute: JobFn = async (ctx) => {
  ctx.log("INFO", `Cleaning up headlines older than ${HEADLINE_RETENTION_DAYS} days`);
  cleanupOldHeadlines(HEADLINE_RETENTION_DAYS);
  return {
    recordsProcessed: 0,
    outputMessage: "Old headlines cleaned up",
  };
};

// ── REFRESH_PROFILE ─────────────────────────────────────
const refreshProfileMeta: JobMeta = {
  code: "REFRESH_PROFILE",
  name: "Refresh Profile",
  description: "Re-scan browser history and bookmarks to discover new interests and reinforce existing ones.",
  groupCode: "AI",
  defaultIntervalSeconds: 86400, // daily
  defaultTimeoutSeconds: 300, // 5 minutes
  defaultDailyRunTime: "02:00",
};

const refreshProfileExecute: JobFn = async (ctx) => {
  ctx.log("INFO", "Refreshing user profile from browser data");
  const result = await refreshProfile();
  ctx.log("INFO", `New topics: ${result.newTopics}, boosted: ${result.boostedTopics}`);
  return {
    recordsProcessed: result.newTopics + result.boostedTopics,
    outputMessage: `${result.newTopics} new topics, ${result.boostedTopics} boosted`,
  };
};

// ── GENERATE_BRIEFING (clustered) ───────────────────────
const generateBriefingMeta: JobMeta = {
  code: "GENERATE_BRIEFING",
  name: "Generate & Email Daily Briefing",
  description: "AI-powered daily briefing: picks top headlines, summarizes them, and emails the result.",
  groupCode: "AI",
  defaultIntervalSeconds: 86400, // daily
  defaultTimeoutSeconds: 300, // 5 minutes — AI calls take time
  defaultDailyRunTime: "16:30",
};

// ── Register all jobs ────────────────────────────────────
export function registerAllJobs() {
  registerClusteredJob(fetchAllNewsMeta, [
    {
      name: "Search by Interests",
      execute: async (ctx) => {
        const headlines = await searchNewsByInterests();
        ctx.data.interestHeadlines = headlines;
        return {
          recordsProcessed: headlines.length,
          outputMessage: `${headlines.length} interest headlines found`,
        };
      },
      continueOnFailure: true, // still fetch RSS even if interest search fails
    },
    {
      name: "Fetch Headlines",
      execute: async (ctx) => {
        const extra = (ctx.data.interestHeadlines || []) as import("../services/news/rss-fetcher.js").RawHeadline[];
        const newCount = await refreshHeadlines(extra);
        return {
          recordsProcessed: newCount,
          outputMessage: `${newCount} new headlines fetched`,
        };
      },
    },
  ]);
  registerJob(scoreHeadlinesMeta, scoreHeadlinesExecute);
  registerClusteredJob(sendMorningDigestMeta, [
    {
      name: "Select Headlines",
      execute: async (ctx) => {
        scoreAllHeadlines();
        const top = getTopHeadlines(15);
        ctx.data.headlines = top;
        return {
          recordsProcessed: top.length,
          outputMessage: `${top.length} headlines selected`,
        };
      },
    },
    {
      name: "Email Digest",
      execute: async (ctx) => {
        const top = ctx.data.headlines as Array<{ title: string; url: string; summary: string | null; topics: string; sourceName: string | null }>;
        if (!top || top.length === 0) {
          return { recordsProcessed: 0, outputMessage: "No headlines to email" };
        }
        const sent = await sendEmailDigest(top);
        return {
          recordsProcessed: sent ? top.length : 0,
          outputMessage: sent ? `${top.length} headlines emailed` : "Email skipped (not configured)",
        };
      },
    },
  ]);
  registerJob(refreshProfileMeta, refreshProfileExecute);
  registerClusteredJob(generateBriefingMeta, [
    {
      name: "Generate Briefing",
      execute: async (ctx) => {
        ctx.log("INFO", "Generating daily briefing");
        const briefing = await generateDailyBriefing();
        ctx.data.briefing = briefing;
        const totalHeadlines = briefing.categories.reduce((n, c) => n + c.headlines.length, 0);
        ctx.log("INFO", `Briefing ready: ${briefing.categories.length} categories, ${totalHeadlines} headlines`);
        return {
          recordsProcessed: totalHeadlines,
          outputMessage: `${briefing.categories.length} categories, ${totalHeadlines} headlines summarized`,
        };
      },
    },
    {
      name: "Email Briefing",
      execute: async (ctx) => {
        const briefing = ctx.data.briefing as import("../services/ai/briefing.js").DailyBriefing;
        if (!briefing || briefing.categories.length === 0) {
          return { recordsProcessed: 0, outputMessage: "No briefing to email" };
        }
        const sent = await sendBriefingEmail(briefing);
        return {
          recordsProcessed: sent ? 1 : 0,
          outputMessage: sent ? "Briefing email sent" : "Email skipped (not configured)",
        };
      },
    },
  ]);
  registerJob(cleanupMeta, cleanupExecute);
}
