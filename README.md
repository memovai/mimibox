# MimiBox

Browser-based code execution sandbox. Python and JavaScript run in your browser via WASM — no server, no local runtime needed.

Designed for **MimiCloud** and other cloud platforms where no local CLI or Python environment is available.

## What It Does

Write code, hit run, see output. That's it.

- **Python** via Pyodide (Python 3.11 WASM) — numpy, pandas, matplotlib included
- **JavaScript** via QuickJS (WASM) — ES2020, microsecond startup
- Matplotlib plots render inline as images
- Everything runs in the browser tab. Nothing is sent to a server.

## Usage

Open `public/index.html` in a browser. Or serve it from anywhere:

```bash
npx serve public
```

Keyboard shortcuts:
- `Ctrl+Enter` / `Cmd+Enter` — Run
- `Tab` — Insert 4 spaces

## How It Works

```
Browser tab
  |
  +-- You write code
  |
  +-- Pyodide (Python WASM) or QuickJS (JS WASM) executes it
  |
  +-- Output + plots displayed
```

No backend. No containers. No sandboxing infrastructure. WASM provides isolation natively — no filesystem access, no network access from inside the sandbox.

## File Structure

```
public/
  index.html    The entire app (UI + sandboxes)
```

One file.

## License

[Apache License 2.0](LICENSE)
