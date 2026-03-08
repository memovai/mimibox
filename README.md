# MimiBox: Turn browsers into sandbox for AI agents.

WASM-sandboxed code execution. Python and JavaScript, no containers, no VMs.

## Install

```bash
npm install -g mimibox
```

Or run directly:

```bash
npx mimibox python 'print("hello")'
```

## Usage

```bash
# Inline code
mimibox python 'import math; print(math.pi)'
mimibox js 'console.log("hello")'

# From file
mimibox python -f script.py
mimibox js -f app.js

# From stdin
echo 'print("hello")' | mimibox python
cat script.js | mimibox js

# Options
mimibox python --timeout 10000 'slow_function()'
mimibox js --memory 100 'big_computation()'
```

### Exit codes

- `0` — success
- `1` — execution error
- `2` — bad arguments

### Output

- `stdout` — execution output
- `stderr` — errors

## How It Works

- **Python** — [Pyodide](https://pyodide.org) (CPython 3.12 compiled to WASM)
- **JavaScript** — [QuickJS](https://bellard.org/quickjs/) via quickjs-emscripten (WASM)

Both run entirely inside WASM. No filesystem access, no network access from inside the sandbox.

## Security

- **Python**: `jsglobals: Object.create(null)` blocks sandbox escape to Node.js globals
- **JavaScript**: QuickJS runs in a true WASM sandbox with no host access
- **Timeout**: 30s default, configurable via `--timeout`
- **Memory**: QuickJS 50MB default, configurable via `--memory`
- **Output**: truncated at 1MB

## Browser Playground

A browser-based playground is also included at `public/index.html` — open it directly or serve it:

```bash
npx serve public
```

## File Structure

```
src/
  cli.ts          CLI entry point
  python.ts       Pyodide wrapper
  javascript.ts   QuickJS wrapper
public/
  index.html      Browser playground
```

## License

[Apache License 2.0](LICENSE)
