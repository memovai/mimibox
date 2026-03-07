import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AuthEnv } from "../middleware/auth.js";
import { getDb } from "../db/client.js";
import { runs } from "../db/schema.js";
import { eq, and } from "drizzle-orm";

export function createRunPollRoutes() {
  const app = new Hono<AuthEnv>();

  // GET /v1/run/:id — poll run status
  app.get("/v1/run/:id", async (c) => {
    const runId = c.req.param("id");
    const apiKeyId = c.get("apiKeyId");
    const db = getDb();

    const run = await db
      .select()
      .from(runs)
      .where(and(eq(runs.id, runId), eq(runs.apiKeyId, apiKeyId)))
      .get();

    if (!run) {
      throw new HTTPException(404, { message: "Run not found" });
    }

    const result = run.result ? JSON.parse(run.result) : null;

    return c.json({
      id: run.id,
      status: run.status,
      prompt: run.prompt,
      model: run.model,
      text: result?.text || null,
      artifacts: result?.artifacts || [],
      error: run.error,
      usage: {
        tokens_in: run.tokensIn,
        tokens_out: run.tokensOut,
        iterations: run.iterations,
      },
      created_at: run.createdAt?.toISOString(),
      completed_at: run.completedAt?.toISOString() || null,
    });
  });

  return app;
}
