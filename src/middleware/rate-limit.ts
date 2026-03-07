import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { AuthEnv } from "./auth.js";

// Simple in-memory sliding window rate limiter
const windows = new Map<string, number[]>();

// Clean up old entries every 5 minutes
setInterval(() => {
  const cutoff = Date.now() - 120_000;
  for (const [key, timestamps] of windows) {
    const filtered = timestamps.filter((t) => t > cutoff);
    if (filtered.length === 0) {
      windows.delete(key);
    } else {
      windows.set(key, filtered);
    }
  }
}, 300_000);

export const rateLimitMiddleware = createMiddleware<AuthEnv>(
  async (c, next) => {
    const apiKeyId = c.get("apiKeyId");
    const limit = c.get("rateLimit");
    const now = Date.now();
    const windowMs = 60_000; // 1 minute

    const timestamps = windows.get(apiKeyId) ?? [];
    const windowStart = now - windowMs;
    const recent = timestamps.filter((t) => t > windowStart);

    if (recent.length >= limit) {
      const retryAfter = Math.ceil((recent[0]! + windowMs - now) / 1000);
      c.header("Retry-After", String(retryAfter));
      c.header("X-RateLimit-Limit", String(limit));
      c.header("X-RateLimit-Remaining", "0");
      throw new HTTPException(429, { message: "Rate limit exceeded" });
    }

    recent.push(now);
    windows.set(apiKeyId, recent);

    c.header("X-RateLimit-Limit", String(limit));
    c.header("X-RateLimit-Remaining", String(limit - recent.length));
    await next();
  }
);
