# Contributing to MyHeadlines

Thanks for your interest in contributing! Here's how to get started.

## Development Setup

1. **Prerequisites**: [Bun](https://bun.sh) 1.0+
2. **Clone and install**:
   ```bash
   git clone https://github.com/df360-net/MyHeadlines.git
   cd MyHeadlines
   bun install
   cd web && bun install && cd ..
   ```
3. **Start development servers**:
   ```bash
   # Terminal 1 — backend (auto-reloads)
   bun run dev

   # Terminal 2 — frontend (Vite dev server with proxy)
   bun run dev:web
   ```
4. **Open** http://localhost:5173 and complete the Setup page.

## Running Tests

```bash
bun run test              # run all tests once
bun run test:watch        # watch mode
```

## Project Structure

```
src/
  db/           — SQLite schema, migrations
  routes/       — Hono API endpoints
  services/     — Business logic (AI, news, interests, delivery)
  scheduler/    — Background job engine
  shared/       — Shared constants and utilities
web/
  src/          — React + Tailwind frontend
tests/
  unit/         — Pure function tests
  integration/  — DB + API tests
  fixtures/     — Test helpers and sample data
scripts/        — Build and compile scripts
```

## Making Changes

1. Create a branch: `git checkout -b my-feature`
2. Make your changes
3. Run tests: `bun run test`
4. Type-check: `bunx tsc --noEmit`
5. Commit with a clear message
6. Open a Pull Request

## Code Style

- TypeScript strict mode — no `any` unless unavoidable
- Prefer Drizzle ORM over raw SQL
- Keep route handlers thin — put logic in services
- Use `console.warn`/`console.error` with `[tag]` prefix for logging

## Reporting Bugs

Open a GitHub Issue with:
- Steps to reproduce
- Expected vs actual behavior
- OS and Bun version
