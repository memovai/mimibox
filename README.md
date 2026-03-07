# MimiBox

**Turn models into skills.** One API call that thinks, executes, and delivers.

LLM APIs give you text. MimiBox gives you results.

## The Problem

Today's LLM APIs are **half-finished tools**. You call GPT/Claude, get back text that says _"here's some Python code that solves your problem"_ — then what? You still need to:

1. Parse the code out of the response
2. Spin up a runtime to execute it
3. Feed errors back to the LLM for retry
4. Handle timeouts, sandboxing, output capture
5. Glue it all together, for every single app you build

Every developer building on LLMs ends up rebuilding the same execution layer. That's the gap.

## The Solution

MimiBox closes the loop. It's **completion infrastructure** — an API that doesn't just _think_, but _does_.

```
Traditional LLM API:
  prompt -> text (you figure out the rest)

MimiBox:
  prompt -> reasoning -> code execution -> verified result
```

One POST request. The agent loop handles everything: the LLM writes code, MimiBox runs it in a WASM sandbox, feeds the output back, iterates until done, and returns the final answer with artifacts.

**Your app sends a prompt. It gets back a result.** Not code to run. Not instructions to follow. A result.

### Use Cases

- **Data analysis on demand** — "Analyze this CSV and plot the trends" returns charts, not code snippets
- **Computational answers** — "What's the Monte Carlo estimate of pi with 10M samples?" returns the number
- **Code as a tool** — Let your users describe what they want in natural language; MimiBox makes it happen
- **Headless automation** — IoT devices, bots, and pipelines that need compute without a local runtime

## Quick Start

```bash
npm install
cp .env.example .env   # Set ANTHROPIC_API_KEY
npm run gen-key myapp --test
npm run dev
```

```bash
curl -X POST http://localhost:3000/v1/run \
  -H "x-api-key: YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Calculate the first 50 prime numbers and return them as a JSON array"}'
```

You get back the array. Not an explanation. Not code. The array.

## Architecture

```
Client (x-api-key)
    |
    v
Hono API Server
    |
    +-- Auth + Rate Limiter
    |
    v
Agent Loop Engine
    |
    +-- LLM (Claude) ---- thinks, plans, writes code
    |
    +-- Tool Router
    |     +-- run_python     -> Pyodide (WASM sandbox)
    |     +-- run_javascript -> QuickJS (WASM sandbox)
    |     +-- web_search     -> Brave / Tavily
    |
    +-- iterate until done
    |
    v
Final Result + Artifacts -> Client
```

The agent loop is the core: LLM generates a tool call, MimiBox executes it in a sandboxed WASM runtime, returns the output to the LLM, and repeats until the task is complete. No containers. No cold starts. Just WASM.

## API

### Authentication

```
x-api-key: mimi_sk_test_xxxxxxxxxxxx
```

### `POST /v1/run` — Synchronous

```bash
curl -X POST http://localhost:3000/v1/run \
  -H "x-api-key: mimi_sk_test_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Generate a bar chart of top 5 programming languages by popularity",
    "tools": ["run_python"],
    "max_iterations": 10,
    "timeout": 60
  }'
```

```json
{
  "id": "run_xxx",
  "status": "completed",
  "text": "Here's the chart based on...",
  "artifacts": [
    { "type": "image", "name": "plot.png", "mimeType": "image/png", "data": "base64..." }
  ],
  "usage": { "tokens_in": 500, "tokens_out": 200, "iterations": 2 },
  "tool_results": [
    { "toolName": "run_python", "input": { "code": "..." }, "output": "..." }
  ]
}
```

### `POST /v1/run/stream` — SSE Streaming

Same parameters. Real-time events as the agent works:

| Event | Description |
|-------|-------------|
| `run.started` | Execution started |
| `text.delta` | LLM text stream chunk |
| `tool.start` | Code execution started |
| `tool.output` | Code execution result |
| `artifact` | Generated file (image etc., base64) |
| `run.completed` | Completed with usage stats |

### `GET /v1/run/:id` — Poll Result

### `POST /v1/sessions` — Multi-turn

```bash
curl -X POST http://localhost:3000/v1/sessions \
  -H "x-api-key: mimi_sk_test_xxx" \
  -H "Content-Type: application/json" \
  -d '{"name": "data analysis"}'
```

Then pass `session_id` in `/v1/run` for conversational context:

```json
{ "prompt": "Now filter for the last 3 years", "session_id": "sess_xxx" }
```

### `GET /v1/sessions/:id/history`

### Request Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `prompt` | string | Yes | What you want done |
| `tools` | string[] | No | Allowed tools (default: all) |
| `model` | string | No | Model (default: `claude-sonnet-4-20250514`) |
| `max_iterations` | number | No | Max agent loops (default: 10) |
| `timeout` | number | No | Timeout in seconds (default: 60) |
| `session_id` | string | No | For multi-turn conversation |

### Available Tools

| Tool | Runtime | What it does |
|------|---------|--------------|
| `run_python` | Pyodide (WASM) | Python 3.11 — numpy, pandas, matplotlib |
| `run_javascript` | QuickJS (WASM) | ES2020 — microsecond cold start |
| `web_search` | Brave / Tavily | Live web search |

## Why WASM Sandboxes

No Docker. No VMs. No cold starts.

Pyodide and QuickJS run as WASM modules inside the Node.js process. Startup is instant, isolation is built-in, and there are zero external dependencies. A pooled Pyodide instance handles numpy/pandas/matplotlib. QuickJS spins up in microseconds.

Trade-off: no filesystem, no network access from inside the sandbox, limited to pure-Python packages. That covers the vast majority of "compute and return" use cases. For full OS environments, we'll add E2B integration later.

## Security

- **Execution timeout**: 30s default, WASM sandboxes support interruption
- **Memory limit**: WASM linear memory cap (QuickJS 50MB)
- **Output limit**: 1MB max per execution
- **Instance recycling**: Pyodide instances recycled after 100 uses
- **Agent loop limit**: 10 iterations max by default
- **Rate limiting**: 60 req/min per API key (configurable)

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
      registry.ts           Tool registration & dispatch
      run-python.ts         Pyodide sandbox
      run-javascript.ts     QuickJS sandbox
      web-search.ts         Search API
  sandbox/
    pyodide-pool.ts         Pyodide instance pool
    quickjs-pool.ts         QuickJS instance pool
  db/
    schema.ts               Drizzle schema
    client.ts               Database connection
```

## Tech Stack

| Component | Choice |
|-----------|--------|
| Framework | Hono (TypeScript) |
| LLM | Anthropic SDK (Claude, streaming + tool_use) |
| Python Sandbox | Pyodide (Python 3.11 WASM) |
| JS Sandbox | QuickJS (WASM) |
| Database | SQLite + drizzle-orm |
| Validation | Zod |

## Development

```bash
npm run dev          # Dev server (hot reload)
npm run build        # Compile TypeScript
npm run start        # Production
npm run gen-key      # Generate API key
npm test             # Run tests
```

## License

[Apache License 2.0](LICENSE)
