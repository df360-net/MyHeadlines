/**
 * Scheduler types — modeled after AskSQL's proven patterns.
 */

export interface JobMeta {
  code: string;
  name: string;
  description: string;
  groupCode: "FETCH" | "SCORING" | "DELIVERY" | "MAINTENANCE" | "AI";
  defaultIntervalSeconds: number;
  defaultTimeoutSeconds: number;
  /** Fixed daily run time in "HH:MM" format (user's local timezone). Null = interval-based. */
  defaultDailyRunTime?: string;
}

export interface JobContext {
  jobRunId: number;
  jobCode: string;
  log: (level: "INFO" | "WARN" | "ERROR", message: string) => void;
  /** Shared data bag for passing results between clustered job steps. */
  data: Record<string, unknown>;
}

export interface JobResult {
  recordsProcessed: number;
  outputMessage: string;
}

export type JobFn = (ctx: JobContext) => Promise<JobResult>;

export interface RegisteredJob {
  meta: JobMeta;
  execute: JobFn;
}
