# MimiBox

Unified LLM + Code Execution API service. One API call = LLM reasoning + code execution + result.

Many users don't have a local Python/Shell environment. MimiBox wraps LLM inference and code execution into a single REST API: send a prompt, the server calls the LLM, executes code, and returns the final result.

## Architecture

```
Client (x-api-key)
    |
    v
Hono API Server (TypeScript/Node.js)
    |
    +-- Auth Middleware (API key)
    +-- Rate Limiter
    |
    v
Agent Loop Engine
    |
    +-- Anthropic SDK (Claude) -- Streaming LLM + tool_use
    |
    +-- Tool Router
    |     +-- run_python     -> Pyodide (Python WASM)
    |     +-- run_javascript -> QuickJS (JS WASM)
    |     +-- web_search     -> Brave/Tavily API
    |
    +-- Sandbox Manager (WASM instance pool)
    |
    v
SSE Stream / JSON Response -> Client
```

## Quick Start

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env and set your ANTHROPIC_API_KEY

# Generate an API key
npm run gen-key myapp --test

# Start the server
npm run dev
```

## API

### Authentication

All `/v1/*` endpoints require an API key in the request header:

```
x-api-key: mimi_sk_test_xxxxxxxxxxxx
```

### Endpoints

#### `GET /health`

Health check (no auth required).

#### `POST /v1/run`

Synchronous execution. Waits for LLM + code execution to complete before returning.

```bash
curl -X POST http://localhost:3000/v1/run \
  -H "x-api-key: mimi_sk_test_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Calculate the first 20 Fibonacci numbers using Python",
    "tools": ["run_python", "run_javascript"],
    "model": "claude-sonnet-4-20250514",
    "max_iterations": 10,
    "timeout": 60
  }'
```

Response:

```json
{
  "id": "run_xxx",
  "status": "completed",
  "text": "The LLM's text response",
  "artifacts": [
    { "type": "image", "name": "plot.png", "mimeType": "image/png", "data": "base64..." }
  ],
  "usage": { "tokens_in": 500, "tokens_out": 200, "iterations": 2 },
  "tool_results": [
    { "toolName": "run_python", "input": { "code": "..." }, "output": "..." }
  ]
}
```

#### `POST /v1/run/stream`

SSE streaming. Same parameters as `/v1/run`.

```bash
curl -N -X POST http://localhost:3000/v1/run/stream \
  -H "x-api-key: mimi_sk_test_xxx" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Write a JS palindrome checker and test it with a few examples"}'
```

Event types:

| Event | Description |
|-------|-------------|
| `run.started` | Execution started |
| `text.delta` | LLM text stream chunk |
| `tool.start` | Code execution started |
| `tool.output` | Code execution result |
| `artifact` | Generated file (image etc., base64) |
| `run.completed` | Completed with usage stats |
| `run.error` | Execution failed |

#### `GET /v1/run/:id`

Poll run status and result.

#### `POST /v1/sessions`

Create a session for multi-turn conversations.

```bash
curl -X POST http://localhost:3000/v1/sessions \
  -H "x-api-key: mimi_sk_test_xxx" \
  -H "Content-Type: application/json" \
  -d '{"name": "data analysis"}'
```

Pass `session_id` in `/v1/run` to use multi-turn conversation:

```json
{ "prompt": "Continue the analysis above", "session_id": "sess_xxx" }
```

#### `GET /v1/sessions/:id/history`

Get conversation history for a session.

### Request Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `prompt` | string | Yes | User prompt |
| `tools` | string[] | No | Allowed tools, defaults to all |
| `model` | string | No | Model name, defaults to `claude-sonnet-4-20250514` |
| `max_iterations` | number | No | Max agent loop iterations, default 10 |
| `timeout` | number | No | Timeout in seconds, default 60 |
| `session_id` | string | No | Session ID for multi-turn conversation |

### Available Tools

| Tool | Sandbox | Description |
|------|---------|-------------|
| `run_python` | Pyodide (WASM) | Python 3.11 with numpy/pandas/matplotlib |
| `run_javascript` | QuickJS (WASM) | ES2020, microsecond cold start |
| `web_search` | Brave/Tavily | Web search (requires API key) |

## Tech Stack

| Component | Choice | Reason |
|-----------|--------|--------|
| Framework | Hono | TS-first, built-in SSE, lightweight |
| LLM | @anthropic-ai/sdk | Native tool_use, streaming |
| Python Sandbox | Pyodide | Python 3.11 WASM, scientific computing |
| JS Sandbox | QuickJS | Microsecond startup, secure isolation |
| Database | SQLite + drizzle-orm | Zero infrastructure, type-safe |
| Validation | Zod | Request schema validation |

## Project Structure

```
src/
  index.ts                  Entry point
  config.ts                 Environment config (Zod)
  routes/
    run.ts                  /v1/run, /v1/run/stream
    run-poll.ts             /v1/run/:id
    sessions.ts             Session CRUD
    health.ts               /health
  middleware/
    auth.ts                 API key auth
    rate-limit.ts           Rate limiting
    error-handler.ts        Global error handler
  agent/
    loop.ts                 Agent loop (LLM <-> Tool)
    tools/
      base.ts               Tool interface
      registry.ts           Tool registration & dispatch
      run-python.ts         Pyodide sandbox
      run-javascript.ts     QuickJS sandbox
      web-search.ts         Search API
  sandbox/
    manager.ts              Sandbox lifecycle
    pyodide-pool.ts         Pyodide instance pool
    quickjs-pool.ts         QuickJS instance pool
  db/
    schema.ts               Drizzle schema
    client.ts               Database connection
scripts/
  gen-key.ts                API key generator
```

## Security

- **Execution timeout**: 30s default, WASM sandboxes support interruption
- **Memory limit**: WASM linear memory has a natural cap (QuickJS 50MB)
- **Output limit**: 1MB max per execution
- **Instance recycling**: Pyodide instances recycled after 100 uses
- **Agent loop limit**: 10 iterations max by default
- **Rate limiting**: 60 requests per minute per API key (configurable)

## Development

```bash
npm run dev          # Dev mode (hot reload)
npm run build        # Compile TypeScript
npm run start        # Production mode
npm run gen-key      # Generate API key
npm test             # Run tests
```

## License

[Apache License 2.0](LICENSE)
