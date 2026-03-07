import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const apiKeys = sqliteTable("api_keys", {
  id: text("id").primaryKey(), // key_xxx
  keyHash: text("key_hash").notNull().unique(),
  name: text("name").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  rateLimit: integer("rate_limit").default(60),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
});

export const runs = sqliteTable("runs", {
  id: text("id").primaryKey(), // run_xxx
  apiKeyId: text("api_key_id")
    .notNull()
    .references(() => apiKeys.id),
  sessionId: text("session_id").references(() => sessions.id),
  prompt: text("prompt").notNull(),
  model: text("model").notNull(),
  status: text("status", {
    enum: ["pending", "running", "completed", "failed"],
  })
    .notNull()
    .default("pending"),
  result: text("result"), // JSON string of final response
  error: text("error"),
  tokensIn: integer("tokens_in").default(0),
  tokensOut: integer("tokens_out").default(0),
  iterations: integer("iterations").default(0),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  completedAt: integer("completed_at", { mode: "timestamp" }),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(), // sess_xxx
  apiKeyId: text("api_key_id")
    .notNull()
    .references(() => apiKeys.id),
  name: text("name"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(), // msg_xxx
  sessionId: text("session_id")
    .notNull()
    .references(() => sessions.id),
  role: text("role", { enum: ["user", "assistant", "tool"] }).notNull(),
  content: text("content").notNull(), // JSON string
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});
