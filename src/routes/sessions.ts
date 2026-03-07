import { Hono } from "hono";
import { z } from "zod";
import { nanoid } from "nanoid";
import { HTTPException } from "hono/http-exception";
import type { AuthEnv } from "../middleware/auth.js";
import { getDb } from "../db/client.js";
import { sessions, messages } from "../db/schema.js";
import { eq, and } from "drizzle-orm";

const createSessionSchema = z.object({
  name: z.string().optional(),
});

export function createSessionRoutes() {
  const app = new Hono<AuthEnv>();

  // POST /v1/sessions — create session
  app.post("/v1/sessions", async (c) => {
    const body = createSessionSchema.parse(await c.req.json());
    const apiKeyId = c.get("apiKeyId");
    const db = getDb();
    const sessionId = `sess_${nanoid(16)}`;

    await db.insert(sessions).values({
      id: sessionId,
      apiKeyId,
      name: body.name || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return c.json({ id: sessionId, name: body.name || null }, 201);
  });

  // GET /v1/sessions/:id — get session
  app.get("/v1/sessions/:id", async (c) => {
    const sessionId = c.req.param("id");
    const apiKeyId = c.get("apiKeyId");
    const db = getDb();

    const session = await db
      .select()
      .from(sessions)
      .where(and(eq(sessions.id, sessionId), eq(sessions.apiKeyId, apiKeyId)))
      .get();

    if (!session) {
      throw new HTTPException(404, { message: "Session not found" });
    }

    return c.json({
      id: session.id,
      name: session.name,
      created_at: session.createdAt?.toISOString(),
      updated_at: session.updatedAt?.toISOString(),
    });
  });

  // GET /v1/sessions/:id/history — get conversation history
  app.get("/v1/sessions/:id/history", async (c) => {
    const sessionId = c.req.param("id");
    const apiKeyId = c.get("apiKeyId");
    const db = getDb();

    // Verify session belongs to this API key
    const session = await db
      .select()
      .from(sessions)
      .where(and(eq(sessions.id, sessionId), eq(sessions.apiKeyId, apiKeyId)))
      .get();

    if (!session) {
      throw new HTTPException(404, { message: "Session not found" });
    }

    const msgs = await db
      .select()
      .from(messages)
      .where(eq(messages.sessionId, sessionId))
      .all();

    return c.json({
      session_id: sessionId,
      messages: msgs.map((m) => ({
        id: m.id,
        role: m.role,
        content: JSON.parse(m.content),
        created_at: m.createdAt?.toISOString(),
      })),
    });
  });

  return app;
}
