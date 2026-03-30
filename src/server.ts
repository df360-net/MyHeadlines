import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { serveStatic } from "hono/bun";
import { setupRoutes } from "./routes/index.js";
import { rateLimit } from "./middleware/rate-limit.js";
import { getEmbeddedAsset, hasEmbeddedAssets } from "./embedded-assets.js";

const app = new Hono();

// Middleware
app.use("*", logger());
app.use("*", cors({
  origin: (origin) => {
    // Allow same-origin requests (no origin header) and localhost dev servers
    if (!origin) return origin;
    if (origin.startsWith("http://localhost:") || origin.startsWith("http://127.0.0.1:")) return origin;
    return null;
  },
}));

// Rate limiting on dangerous/expensive endpoints
app.use("/api/admin/*", rateLimit({ windowMs: 60000, max: 5 }));
app.use("/api/digest/send", rateLimit({ windowMs: 60000, max: 5 }));
app.use("/api/setup", rateLimit({ windowMs: 60000, max: 10 }));

// API routes
setupRoutes(app);

// Health check
app.get("/api/health", (c) => {
  return c.json({ status: "ok", name: "MyHeadlines", version: "1.0.0" });
});

if (hasEmbeddedAssets()) {
  // Compiled binary mode — serve from embedded assets
  app.get("*", (c) => {
    const path = new URL(c.req.url).pathname;

    // Try exact path first
    const asset = getEmbeddedAsset(path);
    if (asset) {
      return new Response(asset.body.buffer as ArrayBuffer, {
        headers: { "Content-Type": asset.mime, "Cache-Control": "public, max-age=31536000, immutable" },
      });
    }

    // SPA fallback — serve index.html for non-API routes
    const index = getEmbeddedAsset("/index.html");
    if (index) {
      return new Response(index.body.buffer as ArrayBuffer, {
        headers: { "Content-Type": index.mime },
      });
    }

    return c.notFound();
  });
} else {
  // Dev mode — serve from file system
  app.use("/assets/*", serveStatic({ root: "./web/dist" }));
  app.use("/vite.svg", serveStatic({ root: "./web/dist" }));
  app.get("*", serveStatic({ root: "./web/dist", path: "index.html" }));
}

export { app };
