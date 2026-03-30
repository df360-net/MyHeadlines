/**
 * Scheduler module — public API.
 * Setup: registerAllJobs() → syncJobsToDb() → startEngine()
 */

export { registerAllJobs } from "./jobs.js";
export { syncJobsToDb, getAllJobs } from "./registry.js";
export { startEngine, stopEngine, triggerJob } from "./engine.js";
export {
  enqueueEvent,
  registerEventHandler,
  processEventBatch,
  recoverStalledEvents,
} from "./events.js";
export type { JobMeta, JobContext, JobResult, JobFn } from "./types.js";
