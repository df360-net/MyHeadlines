# MyHeadlines News Fetching Specifications

> This is the single source of truth for how MyHeadlines fetches, filters, categorizes, and stores news headlines.
> All implementation must follow this document.

---

## 1. News Channels and RSS Endpoints

MyHeadlines pulls news from two pipelines: **Channel RSS Feeds** and **Interest Search**.

### 1.1 Channel RSS Feeds (Built-in Sources)

Each feed is assigned a **fixed category** at the source level. Whatever category we assign here is what the headline gets — no AI re-categorization.

#### Google News (10 channels)

| # | Channel | RSS Endpoint | Category |
|---|---------|-------------|----------|
| 1 | Google News - Top | `https://news.google.com/rss` | general |
| 2 | Google News - Technology | `https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGRqTVhZU0FtVnVHZ0pWVXlnQVAB` | technology |
| 3 | Google News - Business | `https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGx6TVdZU0FtVnVHZ0pWVXlnQVAB` | business |
| 4 | Google News - Science | `https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRFp0Y1RjU0FtVnVHZ0pWVXlnQVAB` | science |
| 5 | Google News - Health | `https://news.google.com/rss/topics/CAAqIQgKIhtDQkFTRGdvSUwyMHZNR3QwTlRFU0FtVnVLQUFQAQ` | health |
| 6 | Google News - Sports | `https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRFp1ZEdvU0FtVnVHZ0pWVXlnQVAB` | sports |
| 7 | Google News - Entertainment | `https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNREpxYW5RU0FtVnVHZ0pWVXlnQVAB` | entertainment |
| 8 | Google News - World | `https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGx1YlY4U0FtVnVHZ0pWVXlnQVAB` | world |
| 9 | Google News - Politics | `https://news.google.com/rss/topics/CAAqIQgKIhtDQkFTRGdvSUwyMHZNRFZ4ZERBU0FtVnVLQUFQAQ` | politics |
| 10 | Google News - Travel | `https://news.google.com/rss/topics/CAAqIQgKIhtDQkFTRGdvSUwyMHZNREpmTjNRU0FtVnVLQUFQAQ` | travel |
| 11 | Google News - Finance | `https://news.google.com/rss/search?q=finance+stocks+markets+investing&hl=en&gl=US&ceid=US:en` | finance |

#### Al Jazeera (1 feed, URL-path categorization)

| # | Channel | RSS Endpoint | Category Logic |
|---|---------|-------------|----------------|
| 1 | Al Jazeera | `https://www.aljazeera.com/xml/rss/all.xml` | Categorized by article URL path (see Section 4) |

Al Jazeera only provides a single RSS feed. Category is determined by the article URL path:

| URL Path Contains | Assigned Category |
|-------------------|-------------------|
| `/news/` | world |
| `/economy/` | finance |
| `/sports/` | sports |
| `/science-and-technology/` | technology |
| `/features/` | entertainment |
| `/opinions/` | politics |
| (default / no match) | world |

#### NPR (5 channels)

| # | Channel | RSS Endpoint | Category |
|---|---------|-------------|----------|
| 1 | NPR News | `https://feeds.npr.org/1001/rss.xml` | general |
| 2 | NPR - World | `https://feeds.npr.org/1004/rss.xml` | world |
| 3 | NPR - Politics | `https://feeds.npr.org/1014/rss.xml` | politics |
| 4 | NPR - Business | `https://feeds.npr.org/1006/rss.xml` | business |
| 5 | NPR - Technology | `https://feeds.npr.org/1019/rss.xml` | technology |

#### Technology-Focused (3 channels)

| # | Channel | RSS Endpoint | Category |
|---|---------|-------------|----------|
| 1 | TechCrunch | `https://techcrunch.com/feed/` | technology |
| 2 | Ars Technica | `https://feeds.arstechnica.com/arstechnica/index` | technology |
| 3 | Hacker News - Front Page | `https://hnrss.org/frontpage` | technology |

**Total built-in feeds: 20**

#### Source Selection Criteria

All built-in sources must meet these requirements:
- **Free** — no paywall. Articles must be fully readable without a subscription.
- **Reputable** — well-known, established news organization.
- **Working RSS** — must return valid RSS/Atom XML with `title`, `link`, and `pubDate` fields.
- **Active** — regularly updated with fresh content.

Sources removed and why:
- **BBC News** — paywall for international users. Headlines visible but articles require subscription within seconds.
- **Reuters** — killed official RSS feeds in 2020. Has a soft paywall.
- **AP News** — no official RSS feeds.

### 1.2 Interest Search (Personalized News)

In addition to channel feeds, MyHeadlines searches for news matching the user's personal interests.

| Parameter | Value |
|-----------|-------|
| Source | Google News RSS Search API |
| URL Pattern | `https://news.google.com/rss/search?q={topic}+when:1d&hl=en&gl=US&ceid=US:en` |
| Max Topics | 10 (top interests by weight) |
| Max Headlines per Topic | 10 |
| Max Total | 100 headlines |
| Time Filter | `when:1d` (Google's built-in "last 24 hours" filter) |
| Execution | All 10 topic searches run **in parallel** |

**How topics are selected:**
- Reads from the `user_interests` table, ordered by `rawWeight` descending
- Takes the top 10 interests
- Each interest's `topic` field becomes the search query

**Category assignment:**
- Each headline gets the interest topic name (lowercased) as its category
- Source name is extracted from the Google News title suffix (e.g., "Headline - CNN" → sourceName = "CNN")

---

## 2. Scheduling and Execution

### 2.1 Fetch All News Job

| Parameter | Value |
|-----------|-------|
| Job Code | `FETCH_ALL_NEWS` |
| Type | Clustered Job (2 sequential steps) |
| Interval | Every 1 hour |
| Timeout | 300 seconds |

**Step 1: Search by Interests**
- Runs `searchNewsByInterests()` — Google News RSS search for top 10 user topics
- Results are passed to Step 2 via `ctx.data.interestHeadlines`
- `continueOnFailure: true` — if interest search fails, RSS fetch still runs

**Step 2: Fetch Headlines**
- Runs `refreshHeadlines(interestHeadlines)` which:
  1. Fetches all 19 built-in RSS feeds in parallel (`fetchAllSources()`)
  2. Merges interest search headlines into the same batch
  3. Deduplicates the combined set
  4. Stores new headlines in the database

### 2.2 Initial Onboarding Fetch

During first-time setup, the same pipeline runs immediately after the user's profile is built:
1. `searchNewsByInterests()` — finds personalized headlines
2. `refreshHeadlines(interestHeadlines)` — fetches all RSS + stores everything

This ensures the user has news ready when they click "View Your Headlines".

---

## 3. Today-Only Filter

**Every RSS fetch only keeps articles published within the last 24 hours.**

### 3.1 How It Works

In `rss-fetcher.ts`, a constant defines the cutoff:

```
MAX_AGE_HOURS = 24
```

For each RSS item, the filter checks the `pubDate` field:

```
cutoff = now - (24 hours in milliseconds)
if item.pubDate exists AND item.pubDate < cutoff → DROP
if item.pubDate exists AND item.pubDate >= cutoff → KEEP
if item.pubDate is missing → KEEP (don't drop articles we can't date)
```

### 3.2 Why We Filter

| Reason | Explanation |
|--------|-------------|
| **Volume control** | Without filtering, a single fetch can pull hundreds of old articles. With the 24h filter, we get only today's news. |
| **Accumulation model** | MyHeadlines runs every hour. Over days and weeks, we build up a full archive internally. No need to re-fetch old articles. |
| **Performance** | Fewer articles per fetch = faster processing, no timeouts. |

### 3.3 Interest Search Filter

The interest search pipeline has its own time filter built into the Google News query:

```
q={topic}+when:1d
```

The `when:1d` parameter tells Google to only return articles from the last 24 hours. This is applied **server-side by Google**, so we only receive recent results.

---

## 4. Categorization

**There is NO AI categorization.** Categories come directly from the RSS source configuration.

### 4.1 Channel Feeds

Each built-in source has a hardcoded `category` field (e.g., `"politics"`, `"technology"`). Every headline fetched from that feed inherits this category.

At insert time, the category string is resolved to a numeric `categoryId` using the topics table:

```
categoryId = getOrCreateTopicId(headline.category)
```

### 4.2 Al Jazeera URL-Path Categorization

Al Jazeera is the one exception — it has a single feed covering all sections. The category is determined by inspecting the article's URL path:

- `aljazeera.com/news/...` → world
- `aljazeera.com/economy/...` → business
- `aljazeera.com/sports/...` → sports
- `aljazeera.com/science-and-technology/...` → technology
- `aljazeera.com/features/...` → entertainment
- `aljazeera.com/opinions/...` → politics
- (anything else) → world

### 4.3 Interest Search

Headlines from interest search get the interest topic name as their category (e.g., `"classical music"`, `"mechanical watches"`). These appear as personal topic tabs in the UI.

---

## 5. Deduplication

Headlines are deduplicated at **two levels** to prevent duplicates.

### 5.1 In-Memory Deduplication (Within a Single Fetch)

Before storing, all fetched headlines (RSS + interest search) are passed through the deduplicator. Two checks:

**A. URL Deduplication**
- URLs are normalized: strip tracking params (`utm_source`, `utm_medium`, `utm_campaign`, `ref`), remove trailing slashes, compare `hostname + pathname`
- If two headlines have the same normalized URL → keep the first one

**B. Title Deduplication**
- Titles are normalized: lowercase, remove all non-alphanumeric characters, collapse whitespace
- If two headlines have the same normalized title (even from different sources) → keep the first one
- This catches the same story reported by multiple outlets with near-identical headlines

### 5.2 Database-Level Deduplication (Across Hourly Fetches)

At insert time, each headline's URL is checked against the existing database:

```sql
SELECT id FROM headlines WHERE url = ?
```

If the URL already exists → **skip** (do not insert).

This ensures that the same article appearing in consecutive hourly fetches is only stored once.

**Concrete example:**
- 9:00 AM — Google/Politics returns headline XYZ (`https://example.com/xyz`) → **inserted**
- 10:00 AM — Google/Politics returns the same headline XYZ → URL already in DB → **skipped**
- 10:00 AM — NPR/Politics returns headline XYZ with different URL (`https://npr.org/xyz`) → same normalized title → **skipped by title dedup**

---

## 6. Data Storage

Each headline is stored in the `headlines` table with these fields:

| Field | Source |
|-------|--------|
| `id` | Auto-generated (nanoid, 12 chars) |
| `title` | From RSS `<title>`, HTML-cleaned |
| `url` | From RSS `<link>` |
| `summary` | From RSS `<contentSnippet>`, truncated to 500 chars |
| `categoryId` | Resolved from RSS source category via `getOrCreateTopicId()` |
| `topicIds` | JSON array containing the categoryId: `[categoryId]` |
| `category` | Raw category string (e.g., `"politics"`) |
| `topics` | JSON array with category string: `["politics"]` |
| `sourceName` | From RSS source config (e.g., `"Google News - Politics"`) |
| `sourceRss` | The RSS feed URL |
| `publishedAt` | From RSS `<pubDate>` |
| `fetchedAt` | Timestamp when we fetched it |
| `score` | Relevance score (set later by scoring job) |
| `feedback` | User feedback: `"up"`, `"down"`, or `null` |

Headlines are also indexed in an **FTS5 full-text search** table (`headlines_fts`) for search functionality.

---

## 7. Cleanup

| Job | Interval | Action |
|-----|----------|--------|
| `CLEANUP_OLD_HEADLINES` | Daily (24h) | Deletes headlines with `fetchedAt` older than 30 days |

This prevents unbounded database growth while keeping a rolling 30-day archive.

---

## 8. Pipeline Summary

```
Every Hour (Fetch All News Job):
  ┌─────────────────────────────────────────────────────┐
  │ Step 1: Search by Interests                         │
  │   - Read top 10 user interests                      │
  │   - Google News RSS search per topic (when:1d)      │
  │   - 10 headlines max per topic                      │
  │   - All 10 searches run in parallel                 │
  │   - Output: up to 100 interest headlines            │
  └──────────────────────┬──────────────────────────────┘
                         │ passed via ctx.data
  ┌──────────────────────▼──────────────────────────────┐
  │ Step 2: Fetch Headlines                             │
  │   a) Fetch 20 built-in RSS feeds (in parallel)      │
  │   b) Merge interest headlines into batch             │
  │   c) 24-hour filter (drop articles older than 24h)  │
  │   d) Deduplicate (by URL + title)                   │
  │   e) Store new headlines (skip existing URLs)        │
  │   f) Assign categoryId from source category         │
  │   g) Index in FTS5 for search                       │
  └─────────────────────────────────────────────────────┘

Daily:
  - CLEANUP_OLD_HEADLINES: remove headlines > 30 days old
```

---

## 9. Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **No AI for categorization** | Too slow, too costly, marginal accuracy gain. RSS source categories are good enough. |
| **Trust RSS source categories** | Google categorizes well. NPR feeds ARE the category. Minor inaccuracies are acceptable. |
| **24-hour fetch window** | Controls volume. Hourly runs accumulate a full archive over time. |
| **URL-based dedup across fetches** | Simple, reliable. Same URL = same article, always. |
| **Title-based dedup within fetch** | Catches same story from multiple outlets. Prevents content duplication. |
| **Al Jazeera URL-path categorization** | Only option — they have one RSS feed. URL paths are reliable section indicators. |
| **All free, no-paywall sources** | User clicks headline → reads full article. Paywall sources create a bad experience. |
| **Interest search via Google News RSS** | No API key needed, no AI tokens burned. Fast, free, targeted. |
