# Changelog

## 1.0.0 (2026-03-30)

Initial public release.

### Features

- **Personalized news feed** — fetches from 20 built-in RSS sources (Google News, Al Jazeera, NPR, TechCrunch, Ars Technica, Hacker News)
- **Interest-based search** — searches Google News for your top 10 personal interests
- **Browser profile scan** — learns your interests from Chrome/Edge/Firefox bookmarks and history
- **AI-powered daily briefing** — top headlines summarized by category, delivered at 4:30 PM
- **Morning digest email** — top 15 headlines delivered at 7:00 AM
- **Deterministic scoring** — headlines ranked by topic relevance, freshness, source quality, and novelty
- **Interest learning** — thumbs up/down feedback trains the interest model via EMA
- **Clean web dashboard** — ad-free, newspaper-style UI with category tabs and topic filters
- **Single binary distribution** — download, run, done (Windows + macOS)
- **Local-first** — all data stored in SQLite, server bound to localhost only
- **Any AI provider** — works with OpenAI, Anthropic, DeepSeek, or any OpenAI-compatible API
- **Dual email delivery** — Amazon SES (primary) with Resend fallback
- **Scheduled jobs** — custom scheduler with hourly news fetch, 15-min scoring, daily digest/briefing/cleanup
