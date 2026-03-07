import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { getDb } from "../db/client.js";
import { apiKeys } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { createHash } from "crypto";

export type AuthEnv = {
  Variables: {
    apiKeyId: string;
    rateLimit: number;
  };
};

function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export const authMiddleware = createMiddleware<AuthEnv>(async (c, next) => {
  const key = c.req.header("x-api-key");
  if (!key) {
    throw new HTTPException(401, { message: "Missing x-api-key header" });
  }

  if (!key.startsWith("mimi_sk_")) {
    throw new HTTPException(401, { message: "Invalid API key format" });
  }

  const db = getDb();
  const hash = hashKey(key);
  const record = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.keyHash, hash))
    .get();

  if (!record) {
    throw new HTTPException(401, { message: "Invalid API key" });
  }

  if (!record.enabled) {
    throw new HTTPException(403, { message: "API key is disabled" });
  }

  c.set("apiKeyId", record.id);
  c.set("rateLimit", record.rateLimit ?? 60);
  await next();
});

export { hashKey };
