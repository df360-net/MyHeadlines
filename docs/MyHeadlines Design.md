# MyHeadlines — System Design

> Consolidated design document for MyHeadlines, a personalized news agent.
> For detailed news fetching specs, see [MyHeadlines News Fetching Specifications.md](MyHeadlines%20News%20Fetching%20Specifications.md).

---

## 1. Overview

MyHeadlines is a desktop news agent that:
- Scans your browser to learn your interests
- Fetches news from RSS feeds (Google News, Al Jazeera, NPR, tech sources)
- Searches for news matching your personal interests
- Scores and ranks headlines based on your profile
- Delivers a **Morning Digest** email at 7:00 AM
- Delivers an **AI-powered Daily Briefing** email at 4:30 PM
- Provides a clean, ad-free web dashboard at `http://127.0.0.1:3456`

---

## 2. Tech Stack

| Component | Choice |
|-----------|--------|
| Runtime | Bun + TypeScript |
| Packaging | `bun build --compile` → single executable (Windows + macOS) |
| Web server | Hono + Bun.serve (bound to 127.0.0.1:3456) |
| Frontend | React + Vite + Tailwind CSS |
| Data fetching | TanStack Query v5 |
| Routing | react-router-dom |
| Icons | lucide-react |
| Database | bun:sqlite + Drizzle ORM (single file) |
| Full-text search | SQLite FTS5 |
| RSS parsing | rss-parser |
| Email delivery | Amazon SES (primary) + Resend (fallback) |
| SMS delivery | Twilio (optional) |
| AI | Any OpenAI-compatible API (user's choice) |
| Scheduling | Custom scheduler with DB-tracked jobs |

---

## 3. Browser Scan & Profile Building

### What We Scan
- **Chrome/Edge bookmarks** — JSON files, not locked while browser running
- **Chrome/Edge history** — SQLite files, must copy first (WAL lock)
- **Firefox bookmarks & history** — `places.sqlite`, must copy first
- **Installed applications** — Windows registry query (no admin needed)

### File Paths
| Data | Windows | Mac |
|------|---------|-----|
| Chrome Bookmarks | `%LOCALAPPDATA%\Google\Chrome\User Data\Default\Bookmarks` | `~/Library/Application Support/Google/Chrome/Default/Bookmarks` |
| Chrome History | `%LOCALAPPDATA%\Google\Chrome\User Data\Default\History` | same pattern |
| Edge Bookmarks | `%LOCALAPPDATA%\Microsoft\Edge\User Data\Default\Bookmarks` | same pattern |
| Firefox | `%APPDATA%\Mozilla\Firefox\Profiles\<profile>\places.sqlite` | `~/Library/Application Support/Firefox/Profiles/` |

### Profile Bootstrap (AI, one-time)
After scanning, AI analyzes the bookmarks and history to extract interests:
- Batches of bookmarks/history sent to LLM
- Returns topic slugs with weight scores (0-1)
- Stored in `user_interests` table
- Solves cold-start problem — agent knows your interests from day one

### Daily Profile Refresh (2:00 AM)
- Only processes new data since last scan
- AI analyzes new bookmarks/history, merges into existing profile
- Boosts existing interests, adds new ones
- Skips if no new browser data

---

## 4. Interest Model & Scoring

### Interest Weights
Each interest: `{ topic, rawWeight (0-1), confidence (0-1), source, lastInteraction, interactionCount }`

**Weight Update (EMA):**
- Click/thumbs-up: `newWeight = 0.3 * 1.0 + 0.7 * oldWeight`
- Confidence grows by 0.05 per interaction, capped at 1.0

**Interest Decay:**
- Half-life: 30 days — weight drops to 50% after 30 days of no interaction
- `decayedWeight = rawWeight * e^(-lambda * age_ms)`
- Topics below 0.01 weight with <3 interactions are pruned

### Headline Scoring (deterministic, no AI)
```
score = 0.50 * topicRelevance
      + 0.25 * freshness
      + 0.10 * sourceQuality
      + 0.15 * novelty
```

| Factor | How it works |
|--------|-------------|
| **Topic Relevance** (50%) | Best matching topic's `decayedWeight * (0.5 + 0.5 * confidence)`. Bonus for multiple matches. |
| **Freshness** (25%) | Exponential decay, 24-hour half-life from publish time. |
| **Source Quality** (10%) | Manually rated 0-1 per RSS source (e.g., Al Jazeera: 0.9, Google News: 0.8). |
| **Novelty** (15%) | Penalizes topics already shown frequently. Prevents feed domination by one topic. |

Score determines sort order in feed. Headlines with score >= 0.65 get the "For You" badge.

### Exploration vs Exploitation
- 80% exploitation — top-scoring headlines by interest match
- 20% exploration — headlines from novel/low-weight topics

---

## 5. Scheduled Jobs

### Job System
- Custom scheduler with 5-second tick loop
- Jobs tracked in `scheduler_jobs` DB table
- Run history in `scheduler_job_runs` with logs
- **Clustered jobs** — chain multiple steps into one job (e.g., Generate → Email)
- **Daily run time** — daily jobs have a fixed HH:MM run time in user's local timezone
- Manual triggers don't shift the daily schedule

### Job Schedule
| Job | Schedule | What it does |
|-----|----------|-------------|
| **Fetch All News** | Every 1h | Search by interests (Google News RSS) + fetch all RSS feeds |
| **Score Headlines** | Every 15m | Re-score all headlines against interest model |
| **Morning Digest** | Daily 7:00 AM | Select top 15 headlines → email |
| **Daily Briefing** | Daily 4:30 PM | AI picks top 5/category, writes 3-4 sentence summaries → email |
| **Refresh Profile** | Daily 2:00 AM | Re-scan browser data, merge new interests |
| **Cleanup Old Headlines** | Daily 3:00 AM | Remove headlines older than 30 days |

---

## 6. AI Usage

### Core Principle
AI is used sparingly — only where human-like understanding is needed. Scoring, ranking, and categorization are all deterministic.

### Where AI IS Used
| Feature | When | Model |
|---------|------|-------|
| **Profile bootstrap** | Once at setup | User's configured model |
| **Profile refresh** | Daily at 2:00 AM (only if new data) | User's configured model |
| **Daily Briefing** | Daily at 4:30 PM | User's configured model |

### Where AI is NOT Used
| Feature | Method |
|---------|--------|
| News categorization | RSS source categories (trusted) |
| Headline scoring/ranking | Deterministic weighted formula |
| Interest weight updates | Exponential Moving Average |
| Interest decay | Exponential time decay |
| Deduplication | URL + title normalization |
| Feed sorting | Score-based ordering |

---

## 7. Email Delivery

### Provider: Resend
- Free tier: 100 emails/day, 3,000/month
- HTML emails with inline CSS (table-based layout for email client compatibility)

### Two Daily Emails
| Email | Time | Content |
|-------|------|---------|
| **Morning Digest** | 7:00 AM | Top 15 headlines with RSS summaries. Subject: "Your Morning Digest — Day, Month Date" |
| **Daily Briefing** | 4:30 PM | AI-curated top 5 headlines per category with 3-4 sentence summaries. Subject: "Your Daily Briefing — Day, Month Date" |

Both emails include "Read full article" links for each headline.

---

## 8. Web Dashboard

### Pages
| Route | Page | Purpose |
|-------|------|---------|
| `/` | Feed | Today's headlines, filterable by category/topic |
| `/briefing` | Briefing | AI-generated daily briefing with summaries |
| `/profile` | Profile | Interest weights visualization |
| `/jobs` | Jobs | Scheduler job status, manual triggers |
| `/settings` | Settings | Email, AI provider, API key configuration |
| `/setup` | Setup | First-run onboarding (email + AI provider) |

### Feed Page
- **Top Stories** box — fixed categories (Politics, World, Finance, Travel, Health, Sports, Entertainment)
- **Your Topics** box — personalized interest categories + Others
- Headlines in card boxes with source, time, summary, topic badges, "Read full article" link
- Thumbs up/down feedback (trains the interest model)
- Paginated with "Load more" button

### Visual Design
- Clean, black and white, newspaper-like aesthetic
- No ads, no noise, no clutter
- Card-based layout with rounded borders
- 70% viewport width (`max-w-5xl`)

---

## 9. Desktop App

### Packaging
1. `bun build --compile` bundles Bun runtime + code into single executable
2. Frontend assets are base64-embedded at build time (no external files needed)
3. Builds for Windows (.exe), macOS ARM64, and macOS x64
4. macOS builds are packaged as `.app` bundles

### First-Run Flow
1. User runs installer → app starts
2. Opens `http://127.0.0.1:3456/setup` in browser
3. User enters email + AI provider + API key → clicks Start
4. Profile scan runs (~1 min) → news fetch runs (~5s)
5. "View Your Headlines" button enables → user sees their feed

---

## 10. Database Schema (Key Tables)

| Table | Purpose |
|-------|---------|
| `config` | Key-value settings (email, AI key, timezone, etc.) |
| `headlines` | All fetched headlines with scores, categories, feedback |
| `headlines_fts` | FTS5 full-text search index |
| `topics` | Topic registry (fixed + dynamic, with display names) |
| `user_interests` | Interest weights, confidence, interaction counts |
| `imported_urls` | Scanned bookmarks and history |
| `digest_sends` | Record of sent digests |
| `scheduler_jobs` | Job definitions with intervals/daily run times |
| `scheduler_job_runs` | Job execution history |
| `scheduler_job_run_logs` | Per-run log entries |
| `event_queue` | Async event processing (clicks, feedback) |
