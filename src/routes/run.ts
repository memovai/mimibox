import { Hono } from "hono";
import { z } from "zod";
import { streamSSE } from "hono/streaming";
import { nanoid } from "nanoid";
import type { AuthEnv } from "../middleware/auth.js";
import { getDb } from "../db/client.js";
import { runs, messages as messagesTable } from "../db/schema.js";
import { runAgent, type AgentEvent, type AgentResult } from "../agent/loop.js";
import type { ToolRegistry } from "../agent/tools/registry.js";
import { eq } from "drizzle-orm";

const runRequestSchema = z.object({
  prompt: z.string().min(1).max(100_000),
  tools: z.array(z.string()).optional(),
  model: z.string().optional(),
  max_iterations: z.coerce.number().min(1).max(50).optional(),
  timeout: z.coerce.number().min(1).max(300).optional(),
  session_id: z.string().optional(),
});

export function createRunRoutes(registry: ToolRegistry) {
  const app = new Hono<AuthEnv>();

  // POST /v1/run — synchronous execution
  app.post("/v1/run", async (c) => {
    const body = runRequestSchema.parse(await c.req.json());
    const apiKeyId = c.get("apiKeyId");
    const runId = `run_${nanoid(16)}`;
    const db = getDb();

    // Create run record
    await db.insert(runs).values({
      id: runId,
      apiKeyId,
      sessionId: body.session_id || null,
      prompt: body.prompt,
      model: body.model || "claude-sonnet-4-20250514",
      status: "running",
      createdAt: new Date(),
    });

    // Load session messages if session_id provided
    let sessionMessages: any[] = [];
    if (body.session_id) {
      const msgs = await db
        .select()
        .from(messagesTable)
        .where(eq(messagesTable.sessionId, body.session_id))
        .all();
      sessionMessages = msgs.map((m) => ({
        role: m.role as "user" | "assistant",
        content: JSON.parse(m.content),
      }));
    }

    try {
      const result = await runAgent(registry, {
        prompt: body.prompt,
        model: body.model,
        tools: body.tools,
        maxIterations: body.max_iterations,
        timeout: body.timeout,
        sessionMessages,
      });

      // Update run record
      await db
        .update(runs)
        .set({
          status: "completed",
          result: JSON.stringify(result),
          tokensIn: result.tokensIn,
          tokensOut: result.tokensOut,
          iterations: result.iterations,
          completedAt: new Date(),
        })
        .where(eq(runs.id, runId));

      // Save to session history if session_id provided
      if (body.session_id) {
        await db.insert(messagesTable).values([
          {
            id: `msg_${nanoid(16)}`,
            sessionId: body.session_id,
            role: "user",
            content: JSON.stringify(body.prompt),
            createdAt: new Date(),
          },
          {
            id: `msg_${nanoid(16)}`,
            sessionId: body.session_id,
            role: "assistant",
            content: JSON.stringify(result.text),
            createdAt: new Date(),
          },
        ]);
      }

      return c.json({
        id: runId,
        status: "completed",
        text: result.text,
        artifacts: result.artifacts,
        usage: {
          tokens_in: result.tokensIn,
          tokens_out: result.tokensOut,
          iterations: result.iterations,
        },
        tool_results: result.toolResults,
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      await db
        .update(runs)
        .set({ status: "failed", error: errorMsg, completedAt: new Date() })
        .where(eq(runs.id, runId));

      return c.json({ id: runId, status: "failed", error: errorMsg }, 500);
    }
  });

  // POST /v1/run/stream — SSE streaming execution
  app.post("/v1/run/stream", async (c) => {
    const body = runRequestSchema.parse(await c.req.json());
    const apiKeyId = c.get("apiKeyId");
    const runId = `run_${nanoid(16)}`;
    const db = getDb();

    await db.insert(runs).values({
      id: runId,
      apiKeyId,
      sessionId: body.session_id || null,
      prompt: body.prompt,
      model: body.model || "claude-sonnet-4-20250514",
      status: "running",
      createdAt: new Date(),
    });

    let sessionMessages: any[] = [];
    if (body.session_id) {
      const msgs = await db
        .select()
        .from(messagesTable)
        .where(eq(messagesTable.sessionId, body.session_id))
        .all();
      sessionMessages = msgs.map((m) => ({
        role: m.role as "user" | "assistant",
        content: JSON.parse(m.content),
      }));
    }

    return streamSSE(c, async (stream) => {
      let finalResult: AgentResult | null = null;

      const onEvent = async (event: AgentEvent) => {
        switch (event.type) {
          case "run.started":
            await stream.writeSSE({
              event: "run.started",
              data: JSON.stringify({ id: runId }),
            });
            break;
          case "text.delta":
            await stream.writeSSE({
              event: "text.delta",
              data: JSON.stringify({ text: event.text }),
            });
            break;
          case "tool.start":
            await stream.writeSSE({
              event: "tool.start",
              data: JSON.stringify({
                tool: event.toolName,
                input: event.toolInput,
              }),
            });
            break;
          case "tool.output":
            await stream.writeSSE({
              event: "tool.output",
              data: JSON.stringify({
                tool: event.toolName,
                output: event.result.output,
                error: event.result.error,
              }),
            });
            break;
          case "artifact":
            await stream.writeSSE({
              event: "artifact",
              data: JSON.stringify(event.artifact),
            });
            break;
          case "run.completed":
            finalResult = event.result;
            break;
        }
      };

      try {
        const result = await runAgent(registry, {
          prompt: body.prompt,
          model: body.model,
          tools: body.tools,
          maxIterations: body.max_iterations,
          timeout: body.timeout,
          sessionMessages,
          onEvent,
        });

        await db
          .update(runs)
          .set({
            status: "completed",
            result: JSON.stringify(result),
            tokensIn: result.tokensIn,
            tokensOut: result.tokensOut,
            iterations: result.iterations,
            completedAt: new Date(),
          })
          .where(eq(runs.id, runId));

        if (body.session_id) {
          await db.insert(messagesTable).values([
            {
              id: `msg_${nanoid(16)}`,
              sessionId: body.session_id,
              role: "user",
              content: JSON.stringify(body.prompt),
              createdAt: new Date(),
            },
            {
              id: `msg_${nanoid(16)}`,
              sessionId: body.session_id,
              role: "assistant",
              content: JSON.stringify(result.text),
              createdAt: new Date(),
            },
          ]);
        }

        await stream.writeSSE({
          event: "run.completed",
          data: JSON.stringify({
            id: runId,
            text: result.text,
            artifacts: result.artifacts,
            usage: {
              tokens_in: result.tokensIn,
              tokens_out: result.tokensOut,
              iterations: result.iterations,
            },
          }),
        });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        await db
          .update(runs)
          .set({ status: "failed", error: errorMsg, completedAt: new Date() })
          .where(eq(runs.id, runId));

        await stream.writeSSE({
          event: "run.error",
          data: JSON.stringify({ id: runId, error: errorMsg }),
        });
      }
    });
  });

  return app;
}
