# MyHeadlines

![version](https://img.shields.io/github/v/release/df360-net/MyHeadlines?label=version&color=blue) ![CI](https://github.com/df360-net/MyHeadlines/actions/workflows/ci.yml/badge.svg) ![license MIT](https://img.shields.io/badge/license-MIT-green)

A personalized news agent that learns your interests and delivers a daily briefing. Download, run, done.

MyHeadlines scans your browser bookmarks and history to build an interest profile, fetches news from RSS feeds, scores headlines using a relevance algorithm, and sends you a daily digest via email.

## Getting Started

### Step 1: Download

Go to the [**Releases page**](https://github.com/df360-net/MyHeadlines/releases) and download the file for your computer:

| If you have... | Download this file |
|----------------|-------------------|
| Windows PC | [MyHeadlines.exe](https://github.com/df360-net/MyHeadlines/releases/latest/download/MyHeadlines.exe) |
| Mac with Apple chip (M1, M2, M3, M4) | [MyHeadlines-mac-arm64](https://github.com/df360-net/MyHeadlines/releases/latest/download/MyHeadlines-mac-arm64) |
| Mac with Intel chip (older Macs) | [MyHeadlines-mac-x64](https://github.com/df360-net/MyHeadlines/releases/latest/download/MyHeadlines-mac-x64) |

Not sure which Mac you have? Click the Apple menu > "About This Mac". If it says "Apple M1" (or M2, M3, M4), download the ARM64 version. Otherwise, download the x64 version.

### Step 2: Run It

1. Move the downloaded file to your **Desktop** or any folder you like.
2. **Windows:** Your browser may warn that the file "isn't commonly downloaded." This is normal for new open-source software — click **"Keep"** then **"Keep anyway"** to complete the download. Double-click `MyHeadlines.exe` to run it. If Windows SmartScreen shows a warning, click **"More info"** then **"Run anyway"**.
3. **Mac:** Open Terminal and run these three commands (replace the filename if you downloaded the x64 version):
   ```
   xattr -cr ~/Downloads/MyHeadlines-mac-arm64
   chmod +x ~/Downloads/MyHeadlines-mac-arm64
   ~/Downloads/MyHeadlines-mac-arm64
   ```
   The first command removes the macOS quarantine flag (otherwise you'll get a "damaged" error). The second makes it executable. The third runs it.
4. A terminal window will appear with some startup messages. **Keep this window open** — this is MyHeadlines running. When you want to stop it, just close this window.

### Step 3: Open the Dashboard

1. Open your web browser (Chrome, Edge, Safari, Firefox — any will work).
2. In the address bar, type: **http://127.0.0.1:3456** and press Enter.
3. You should see the MyHeadlines setup page.

### Step 4: Complete the Setup

You need two things:

**Your email address** — where MyHeadlines will send your daily news digest.

**An AI API key** — MyHeadlines uses AI to understand your interests and summarize the news. You need an API key from one of these providers:

- **DeepSeek** (cheapest, recommended) — Go to [platform.deepseek.com](https://platform.deepseek.com/api_keys), create an account, add $5 credit, and copy your API key. Select "DeepSeek" as the provider in MyHeadlines.
- **OpenAI** — Go to [platform.openai.com/api-keys](https://platform.openai.com/api-keys), create an account, add $5 credit, and copy your API key. Select "OpenAI" as the provider in MyHeadlines.
- **Anthropic** — Go to [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys), create an account, add $5 credit, and copy your API key. Select "Custom" provider in MyHeadlines, enter `https://api.anthropic.com/v1` as the Base URL and `claude-sonnet-4-6` as the Model.
- **Ollama** (free, runs on your computer) — Install [Ollama](https://ollama.com), run `ollama pull llama3`, then select "Custom" provider in MyHeadlines and enter `http://localhost:11434/v1` as the Base URL.

Fill in the form and click **Save**.

### Step 5: View Your News

Click the blue **"View Your News"** button. MyHeadlines will:
1. Scan your browser bookmarks and history to learn what you're interested in.
2. Fetch the latest news from 20+ sources.
3. Score and rank every headline based on your interests.

This takes about 30 seconds the first time. After that, your personalized news feed is ready!

### Step 6: Daily Digest (Automatic)

Once set up, MyHeadlines runs in the background and:
- Fetches fresh news every hour
- Sends you a **Morning Digest email** at 7:00 AM with your top headlines
- Sends an **AI-powered Daily Briefing email** at 4:30 PM with summaries

Just keep the program running (leave the terminal window open). If you restart your computer, double-click the file again to start it back up.

---

## Features

- **Auto-profile** — scans bookmarks, browsing history, and installed apps to learn your interests
- **Smart scoring** — headlines ranked by topic relevance, freshness, source quality, and novelty
- **Daily briefing** — AI-curated summary of top stories, grouped by category
- **Email digest** — morning delivery with your personalized news
- **Interest learning** — adapts over time from your feedback (thumbs up/down)
- **Web dashboard** — browse your feed, manage interests, view briefing, configure jobs
- **Background scheduler** — automated fetching, scoring, and delivery

---

## For Developers

### Build from Source

**Prerequisites:** [Bun](https://bun.sh) 1.0+

```bash
git clone https://github.com/df360-net/MyHeadlines.git
cd MyHeadlines
bun install
cd web && bun install && cd ..
bun run build:web
bun run start
```

### Build Standalone Executable

```bash
bun run build:bin
```

This produces `MyHeadlines.exe` (Windows), `MyHeadlines-mac-arm64`, and `MyHeadlines-mac-x64`.

### Development

```bash
# Backend (auto-reloads)
bun run dev

# Frontend (Vite dev server with proxy)
bun run dev:web

# Run tests
bun run test
```

### Architecture

```
src/
  db/           — SQLite schema and migrations (bun:sqlite + Drizzle ORM)
  routes/       — Hono API endpoints
  services/
    ai/         — LLM integration (topic extraction, briefing, profile building)
    interests/  — Scoring engine, EMA learning, interest model
    news/       — RSS fetching, deduplication, interest-based search
    delivery/   — Email (Resend) delivery
    scanner/    — Browser bookmark/history scanner
    topics/     — Topic registry and display ordering
  scheduler/    — Background job engine (5s tick loop)
  shared/       — Shared constants and utilities
web/            — React + Vite + Tailwind dashboard
tests/          — Vitest unit and integration tests
scripts/        — Build and compile scripts
```

### How It Works

1. **Setup** — user enters email and AI provider API key
2. **Scan** — reads browser bookmarks/history to build initial interest profile
3. **Fetch** — pulls headlines from Google News RSS, Al Jazeera, NPR, TechCrunch, and more
4. **Score** — each headline scored: 50% topic relevance + 25% freshness + 10% source quality + 15% novelty
5. **Learn** — clicks and feedback adjust interest weights via exponential moving average
6. **Deliver** — daily briefing email with AI-curated summaries per category

### Configuration

All settings are configured through the Setup page and stored in the SQLite database.

Data is stored in:
- **Windows:** `%LOCALAPPDATA%\MyHeadlines\`
- **macOS/Linux:** `~/MyHeadlines/`

Override with `MYHEADLINES_DATA_DIR` environment variable.

### Tech Stack

- **Runtime:** [Bun](https://bun.sh)
- **Backend:** TypeScript, Hono, bun:sqlite, Drizzle ORM
- **Frontend:** React, Vite, Tailwind CSS, TanStack Query
- **AI:** Any OpenAI-compatible API
- **Email:** Resend
- **Tests:** Vitest

## License

[MIT](LICENSE)
