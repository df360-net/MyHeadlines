import { app } from "./server.js";
import { runMigrations } from "./db/migrate.js";
import { DATA_DIR, DB_PATH } from "./db/index.js";
import { registerAllJobs, syncJobsToDb, startEngine, stopEngine } from "./scheduler/index.js";
import { readFileSync } from "fs";
import { join } from "path";

const PORT = Number(process.env.PORT || "3456");
const HOST = "127.0.0.1";

// Read version from package.json (works in both dev and compiled binary)
let version = "unknown";
try {
  const pkg = JSON.parse(readFileSync(join(import.meta.dir, "..", "package.json"), "utf-8"));
  version = pkg.version;
} catch {
  // Compiled binary — package.json not available, use compile-time define
  version = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "1.0.0";
}
declare const __APP_VERSION__: string;

const banner = `MyHeadlines v${version}`;
const pad = Math.max(0, 38 - banner.length);
const left = Math.floor(pad / 2);
const right = pad - left;
console.log("╔══════════════════════════════════════╗");
console.log(`║${" ".repeat(left)} ${banner} ${" ".repeat(right)}║`);
console.log("╚══════════════════════════════════════╝");
console.log();

// Step 1: Run database migrations
console.log(`[startup] Data directory: ${DATA_DIR}`);
console.log(`[startup] Database: ${DB_PATH}`);
runMigrations();

// Step 2: Start web server
Bun.serve({
  fetch: app.fetch,
  port: PORT,
  hostname: HOST,
  idleTimeout: 40,
});
console.log(`[server] Running at http://${HOST}:${PORT}`);

// Step 3: Register and sync scheduler jobs
registerAllJobs();
syncJobsToDb();

// Step 4: Start the scheduler engine (5s tick loop)
startEngine();

console.log();
console.log("[startup] MyHeadlines is ready.");

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n[shutdown] Stopping...");
  stopEngine();
  process.exit(0);
});
process.on("SIGTERM", () => {
  stopEngine();
  process.exit(0);
});
