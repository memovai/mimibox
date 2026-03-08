import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import Anthropic from "@anthropic-ai/sdk";

const app = new Hono();

// Claude API proxy — browser can't call Anthropic directly (CORS)
app.post("/api/chat", async (c) => {
  const body = await c.req.json();
  const client = new Anthropic();

  const response = await client.messages.create({
    model: body.model || "claude-sonnet-4-20250514",
    max_tokens: 4096,
    system: body.system,
    tools: body.tools,
    messages: body.messages,
  });

  return c.json(response);
});

// Static files
app.use("/*", serveStatic({ root: "./public" }));

const port = Number(process.env.PORT) || 3000;
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`MimiBox running at http://localhost:${info.port}`);
});
