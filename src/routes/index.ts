import type { Hono } from "hono";
import { headlinesRoutes } from "./headlines.js";
import { settingsRoutes } from "./settings.js";
import { setupRoute } from "./setup.js";
import { profileRoutes } from "./profile.js";
import { digestRoutes } from "./digest.js";
import { jobsRoutes } from "./jobs.js";
import { adminRoutes } from "./admin.js";
import { briefingRoutes } from "./briefing.js";

export function setupRoutes(app: Hono) {
  app.route("/api/headlines", headlinesRoutes);
  app.route("/api/settings", settingsRoutes);
  app.route("/api/setup", setupRoute);
  app.route("/api/profile", profileRoutes);
  app.route("/api/digest", digestRoutes);
  app.route("/api/jobs", jobsRoutes);
  app.route("/api/admin", adminRoutes);
  app.route("/api/briefing", briefingRoutes);
}
