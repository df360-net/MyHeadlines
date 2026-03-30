import { app } from "./server.js";
import { runMigrations } from "./db/migrate.js";
import { DATA_DIR, DB_PATH } from "./db/index.js";
import { registerAllJobs, syncJobsToDb, startEngine, stopEngine } from "./scheduler/index.js";

const PORT = Number(process.env.PORT || "3456");
const HOST = "127.0.0.1";

console.log("╔══════════════════════════════════════╗");
console.log("║         MyHeadlines v1.0.0           ║");
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
