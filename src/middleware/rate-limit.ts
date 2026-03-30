/**
 * Simple in-memory rate limiter middleware for Hono.
 * Tracks requests per IP with a sliding window.
 */

import type { Context, Next } from "hono";

interface RateLimitOptions {
  windowMs: number; // time window in ms
  max: number;      // max requests per window
}

const MAX_ENTRIES = 10000; // cap map size to prevent memory leak
const hits = new Map<string, number[]>();

// Cleanup stale entries every 60s
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamps] of hits) {
    const fresh = timestamps.filter((t) => now - t < 300000); // keep last 5 min
    if (fresh.length === 0) hits.delete(key);
    else hits.set(key, fresh);
  }
}, 60000);

export function rateLimit(options: RateLimitOptions) {
  return async (c: Context, next: Next) => {
    const key = c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || "local";
    const now = Date.now();
    const windowStart = now - options.windowMs;

    const timestamps = hits.get(key) || [];
    const recent = timestamps.filter((t) => t > windowStart);

    if (recent.length >= options.max) {
      return c.json({ error: "Too many requests. Please try again later." }, 429);
    }

    // Evict oldest entries if map is too large
    if (hits.size >= MAX_ENTRIES && !hits.has(key)) {
      const oldest = hits.keys().next().value;
      if (oldest) hits.delete(oldest);
    }

    recent.push(now);
    hits.set(key, recent);

    await next();
  };
}
