# MimiBox

**Turn models into skills.** One prompt that thinks, executes, and delivers — all in the browser.

LLM APIs give you text. MimiBox gives you results.

## The Problem

LLM APIs are **half-finished tools**. You get back text that says _"here's some Python code"_ — but where do you run it? Not everyone has a local CLI or Python runtime. MimiCloud users, Chromebook users, mobile users, IoT devices — they all lack a local execution environment.

You end up needing to:
1. Parse code from the LLM response
2. Find somewhere to run it
3. Feed errors back for retry
4. Glue it all together

## The Solution

MimiBox closes the loop. Type a prompt, the LLM writes code, the **browser executes it in a WASM sandbox**, and you see the result. No server-side compute. No local runtime needed. Just a browser.

```
Traditional LLM API:
  prompt -> text (you figure out the rest)

MimiBox:
  prompt -> LLM writes code -> browser WASM sandbox runs it -> result
```

Designed for **MimiCloud** and other cloud platforms where no local CLI or Python runtime is available.

### How It Works

1. You type a prompt
2. Claude writes code to solve it
3. Pyodide (Python) or QuickJS (JS) executes the code **in your browser** via WASM
4. Output and artifacts (charts, data) appear instantly
5. The agent iterates until the task is done

No Docker. No VMs. No server-side sandbox. Your browser is the sandbox.

## Quick Start

```bash
npm install
cp .env.example .env   # Set ANTHROPIC_API_KEY
npm run dev
```

Open `http://localhost:3000` and start prompting.

## Architecture

```
Browser
  |
  +-- UI (single HTML page)
  +-- Agent Loop (JS)
  |     +-- calls /api/chat (Claude proxy)
  |     +-- executes tool_use responses locally
  |
  +-- Pyodide (Python 3.11 WASM)
  |     numpy, pandas, matplotlib
  |
  +-- QuickJS (JavaScript WASM)
        ES2020, microsecond startup

Server (minimal)
  |
  +-- serves static files
  +-- proxies /api/chat -> Anthropic API (CORS)
```

The server is ~20 lines. It only exists because browsers can't call the Anthropic API directly (CORS). All code execution happens client-side.

## What You Can Do

- **"Calculate pi using Monte Carlo with 1M samples"** — runs Python, returns the number
- **"Plot a sine wave with matplotlib"** — runs Python, shows the chart in the browser
- **"Write a function to check palindromes and test it"** — runs JS, shows the output
- **"Analyze this data..."** — runs pandas, returns the analysis

Multi-turn conversation is built in. Follow up naturally.

## Browser Sandboxes

| Runtime | What | Capabilities |
|---------|------|-------------|
| Pyodide | Python 3.11 WASM | numpy, pandas, matplotlib, micropip |
| QuickJS | JavaScript WASM | ES2020, microsecond cold start |

Both run entirely in the browser tab. No network access, no filesystem — secure by design. Matplotlib plots are captured as PNG and displayed inline.

## Project Structure

```
src/
  server.ts         Tiny server: static files + Claude API proxy
public/
  index.html        Everything: UI, agent loop, WASM sandboxes
```

That's it. Two files.

## Development

```bash
npm run dev       # Dev server (hot reload)
npm run build     # Compile TypeScript
npm run start     # Production
```

## License

[Apache License 2.0](LICENSE)
