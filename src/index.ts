import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { cors } from "hono/cors";
import { getConfig } from "./config.js";
import { initDb } from "./db/client.js";
import { authMiddleware } from "./middleware/auth.js";
import { rateLimitMiddleware } from "./middleware/rate-limit.js";
import { errorHandler } from "./middleware/error-handler.js";
import { health } from "./routes/health.js";
import { createRunRoutes } from "./routes/run.js";
import { createRunPollRoutes } from "./routes/run-poll.js";
import { createSessionRoutes } from "./routes/sessions.js";
import { initSandboxes } from "./sandbox/manager.js";
import { ToolRegistry } from "./agent/tools/registry.js";
import { runJavaScriptTool } from "./agent/tools/run-javascript.js";
import { runPythonTool } from "./agent/tools/run-python.js";
import { webSearchTool } from "./agent/tools/web-search.js";

// Load env
const config = getConfig();

// Init database
const db = initDb();
console.log("Database initialized");

// Init sandboxes
await initSandboxes();

// Register tools
const registry = new ToolRegistry();
registry.register(runJavaScriptTool);
registry.register(runPythonTool);
registry.register(webSearchTool);
console.log("Tools registered: run_javascript, run_python, web_search");

// Create app
const app = new Hono();

// Global middleware
app.use("*", cors());
app.onError(errorHandler);

// Public routes
app.route("/", health);

// Protected routes
const api = new Hono();
api.use("*", authMiddleware);
api.use("*", rateLimitMiddleware);
api.route("/", createRunRoutes(registry));
api.route("/", createRunPollRoutes());
api.route("/", createSessionRoutes());
app.route("/", api);

// Start server
serve(
  { fetch: app.fetch, port: config.PORT, hostname: config.HOST },
  (info) => {
    console.log(`MimiAPI server running at http://${info.address}:${info.port}`);
  }
);
