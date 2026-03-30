/**
 * RSS feed sources organized by category.
 * Google News RSS is the backbone — free, broad, no API key needed.
 * Dynamic feeds (discovered by AI) are stored in the database.
 */

import { db } from "../../db/index.js";
import { config } from "../../db/schema.js";
import { eq } from "drizzle-orm";

export interface RssSource {
  name: string;
  url: string;
  category: string;
}

/**
 * Get all RSS sources: built-in + dynamic (from DB).
 */
export function getAllSources(): RssSource[] {
  const dynamic = loadDynamicSources();
  return [...BUILTIN_SOURCES, ...dynamic];
}

function loadDynamicSources(): RssSource[] {
  const row = db
    .select()
    .from(config)
    .where(eq(config.key, "dynamic_rss_sources"))
    .get();

  if (!row) return [];
  try {
    return JSON.parse(row.value);
  } catch (err) {
    console.warn("[sources] Failed to parse saved sources config:", (err as Error).message);
    return [];
  }
}

/** Built-in RSS sources */
const BUILTIN_SOURCES: RssSource[] = [
  // Google News — covers all major categories
  {
    name: "Google News - Top",
    url: "https://news.google.com/rss",
    category: "general",
  },
  {
    name: "Google News - Technology",
    url: "https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGRqTVhZU0FtVnVHZ0pWVXlnQVAB",
    category: "technology",
  },
  {
    name: "Google News - Business",
    url: "https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGx6TVdZU0FtVnVHZ0pWVXlnQVAB",
    category: "business",
  },
  {
    name: "Google News - Science",
    url: "https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRFp0Y1RjU0FtVnVHZ0pWVXlnQVAB",
    category: "science",
  },
  {
    name: "Google News - Health",
    url: "https://news.google.com/rss/topics/CAAqIQgKIhtDQkFTRGdvSUwyMHZNR3QwTlRFU0FtVnVLQUFQAQ",
    category: "health",
  },
  {
    name: "Google News - Sports",
    url: "https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRFp1ZEdvU0FtVnVHZ0pWVXlnQVAB",
    category: "sports",
  },
  {
    name: "Google News - Entertainment",
    url: "https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNREpxYW5RU0FtVnVHZ0pWVXlnQVAB",
    category: "entertainment",
  },

  // Google News — Finance (stock markets, investing, banking)
  {
    name: "Google News - Finance",
    url: "https://news.google.com/rss/search?q=finance+stocks+markets+investing&hl=en&gl=US&ceid=US:en",
    category: "finance",
  },

  // Google News — remaining fixed categories
  {
    name: "Google News - World",
    url: "https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGx1YlY4U0FtVnVHZ0pWVXlnQVAB",
    category: "world",
  },
  {
    name: "Google News - Politics",
    url: "https://news.google.com/rss/topics/CAAqIQgKIhtDQkFTRGdvSUwyMHZNRFZ4ZERBU0FtVnVLQUFQAQ",
    category: "politics",
  },
  {
    name: "Google News - Travel",
    url: "https://news.google.com/rss/topics/CAAqIQgKIhtDQkFTRGdvSUwyMHZNREpmTjNRU0FtVnVLQUFQAQ",
    category: "travel",
  },

  // Al Jazeera — non-Western perspective
  {
    name: "Al Jazeera",
    url: "https://www.aljazeera.com/xml/rss/all.xml",
    category: "world",
  },

  // NPR — free, no paywall
  {
    name: "NPR News",
    url: "https://feeds.npr.org/1001/rss.xml",
    category: "general",
  },
  {
    name: "NPR - World",
    url: "https://feeds.npr.org/1004/rss.xml",
    category: "world",
  },
  {
    name: "NPR - Politics",
    url: "https://feeds.npr.org/1014/rss.xml",
    category: "politics",
  },
  {
    name: "NPR - Business",
    url: "https://feeds.npr.org/1006/rss.xml",
    category: "business",
  },
  {
    name: "NPR - Technology",
    url: "https://feeds.npr.org/1019/rss.xml",
    category: "technology",
  },

  // Tech — free, no paywall
  {
    name: "TechCrunch",
    url: "https://techcrunch.com/feed/",
    category: "technology",
  },
  {
    name: "Ars Technica",
    url: "https://feeds.arstechnica.com/arstechnica/index",
    category: "technology",
  },
  {
    name: "Hacker News - Front Page",
    url: "https://hnrss.org/frontpage",
    category: "technology",
  },
];
