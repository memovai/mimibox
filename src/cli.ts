#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { executeJavaScript } from "./javascript.js";
import { executePython } from "./python.js";

const EXIT_SUCCESS = 0;
const EXIT_ERROR = 1;
const EXIT_BAD_ARGS = 2;

function usage(): never {
  process.stderr.write(
    `Usage: mimibox <python|js> [options] [code]

Commands:
  python    Execute Python code (Pyodide WASM sandbox)
  js        Execute JavaScript code (QuickJS WASM sandbox)

Options:
  -f <file>       Read code from file
  --timeout <ms>  Execution timeout in milliseconds (default: 30000)
  --memory <mb>   Memory limit in MB, JS only (default: 50)
  -h, --help      Show this help

Examples:
  mimibox python 'print(1+1)'
  mimibox js 'console.log("hello")'
  mimibox python -f script.py
  echo 'print("hi")' | mimibox python
`
  );
  process.exit(EXIT_BAD_ARGS);
}

async function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    process.stdin.on("end", () => resolve(Buffer.concat(chunks).toString()));
    process.stdin.on("error", reject);
  });
}

interface ParsedArgs {
  lang: "python" | "js";
  code: string;
  timeout?: number;
  memory?: number;
}

function parseArgs(argv: string[]): ParsedArgs | null {
  const args = argv.slice(2); // skip node + script

  if (args.length === 0 || args[0] === "-h" || args[0] === "--help") {
    return null;
  }

  const lang = args[0];
  if (lang !== "python" && lang !== "js") {
    return null;
  }

  let code: string | undefined;
  let file: string | undefined;
  let timeout: number | undefined;
  let memory: number | undefined;

  let i = 1;
  while (i < args.length) {
    const arg = args[i];
    if (arg === "-f" && i + 1 < args.length) {
      file = args[++i];
    } else if (arg === "--timeout" && i + 1 < args.length) {
      timeout = parseInt(args[++i], 10);
      if (isNaN(timeout) || timeout <= 0) {
        process.stderr.write("Error: --timeout must be a positive number\n");
        process.exit(EXIT_BAD_ARGS);
      }
    } else if (arg === "--memory" && i + 1 < args.length) {
      memory = parseInt(args[++i], 10);
      if (isNaN(memory) || memory <= 0) {
        process.stderr.write("Error: --memory must be a positive number\n");
        process.exit(EXIT_BAD_ARGS);
      }
    } else if (arg === "-h" || arg === "--help") {
      return null;
    } else if (!code && !arg.startsWith("-")) {
      code = arg;
    } else {
      process.stderr.write(`Error: unexpected argument '${arg}'\n`);
      process.exit(EXIT_BAD_ARGS);
    }
    i++;
  }

  // Resolve code source: explicit code > file > stdin
  let resolvedCode: string;
  if (file) {
    try {
      resolvedCode = readFileSync(file, "utf8");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`Error reading file: ${msg}\n`);
      process.exit(EXIT_BAD_ARGS);
    }
  } else if (code) {
    resolvedCode = code;
  } else {
    // Will be filled from stdin in main()
    resolvedCode = "";
  }

  return { lang, code: resolvedCode, timeout, memory };
}

async function main() {
  const parsed = parseArgs(process.argv);
  if (!parsed) usage();

  // If no code yet, read from stdin
  if (!parsed.code) {
    if (process.stdin.isTTY) {
      process.stderr.write("Error: no code provided\n");
      usage();
    }
    parsed.code = await readStdin();
    if (!parsed.code.trim()) {
      process.stderr.write("Error: empty input\n");
      process.exit(EXIT_BAD_ARGS);
    }
  }

  let result: { output: string; error: string };

  if (parsed.lang === "js") {
    result = await executeJavaScript(parsed.code, {
      timeout: parsed.timeout,
      memory: parsed.memory,
    });
  } else {
    result = await executePython(parsed.code, {
      timeout: parsed.timeout,
    });
  }

  if (result.output) {
    process.stdout.write(result.output);
  }

  if (result.error) {
    process.stderr.write(result.error);
    process.exit(EXIT_ERROR);
  }

  process.exit(EXIT_SUCCESS);
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err instanceof Error ? err.message : err}\n`);
  process.exit(EXIT_ERROR);
});
