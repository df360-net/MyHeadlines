import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "./schema.js";
import { join } from "path";
import { existsSync, mkdirSync, chmodSync } from "fs";

const isTest = !!(process.env.NODE_ENV === "test" || process.env.VITEST);

const DATA_DIR =
  process.env.MYHEADLINES_DATA_DIR ||
  join(
    process.env.LOCALAPPDATA || process.env.HOME || ".",
    "MyHeadlines"
  );

// Ensure data directory exists with restrictive permissions
if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
}
try { chmodSync(DATA_DIR, 0o700); } catch { /* Windows ignores chmod */ }

// Use a separate test database to protect user data
const DB_PATH = join(DATA_DIR, isTest ? "myheadlines-test.db" : "myheadlines.db");

const sqlite = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
sqlite.exec("PRAGMA journal_mode = WAL");

export const db = drizzle(sqlite, { schema });
export { sqlite, DB_PATH, DATA_DIR };
