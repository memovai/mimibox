import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default("0.0.0.0"),

  ANTHROPIC_API_KEY: z.string().min(1, "ANTHROPIC_API_KEY is required"),

  DATABASE_URL: z.string().default("./data/mimibox.db"),

  BRAVE_API_KEY: z.string().optional(),
  TAVILY_API_KEY: z.string().optional(),

  RATE_LIMIT_RPM: z.coerce.number().default(60),

  DEFAULT_MODEL: z.string().default("claude-sonnet-4-20250514"),
  MAX_ITERATIONS: z.coerce.number().default(10),
  EXECUTION_TIMEOUT: z.coerce.number().default(30),
});

export type Env = z.infer<typeof envSchema>;

let _config: Env | null = null;

export function getConfig(): Env {
  if (!_config) {
    _config = envSchema.parse(process.env);
  }
  return _config;
}
