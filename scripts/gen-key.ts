import { nanoid } from "nanoid";
import { createHash } from "crypto";
import Database from "better-sqlite3";
import { mkdirSync } from "fs";
import { dirname } from "path";

const dbPath = process.env.DATABASE_URL || "./data/mimiapi.db";
mkdirSync(dirname(dbPath), { recursive: true });

const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");

// Ensure table exists
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS api_keys (
    id TEXT PRIMARY KEY,
    key_hash TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    rate_limit INTEGER DEFAULT 60,
    enabled INTEGER NOT NULL DEFAULT 1
  );
`);

const name = process.argv[2] || "default";
const isTest = process.argv.includes("--test");

const keyId = `key_${nanoid(12)}`;
const secret = nanoid(32);
const prefix = isTest ? "mimi_sk_test_" : "mimi_sk_live_";
const fullKey = `${prefix}${secret}`;
const keyHash = createHash("sha256").update(fullKey).digest("hex");

sqlite.prepare(
  "INSERT INTO api_keys (id, key_hash, name, created_at, rate_limit, enabled) VALUES (?, ?, ?, ?, ?, ?)"
).run(keyId, keyHash, name, Date.now(), 60, 1);

console.log("API Key generated successfully!");
console.log("---");
console.log(`Name:    ${name}`);
console.log(`Key ID:  ${keyId}`);
console.log(`API Key: ${fullKey}`);
console.log("---");
console.log("Save this key securely — it cannot be retrieved later.");

sqlite.close();
