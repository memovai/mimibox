import { getQuickJS, shouldInterruptAfterDeadline } from "quickjs-emscripten";

export interface ExecuteOptions {
  timeout?: number;
  memory?: number;
}

export interface ExecuteResult {
  output: string;
  error: string;
}

const MAX_OUTPUT = 1024 * 1024; // 1MB

export async function executeJavaScript(
  code: string,
  opts: ExecuteOptions = {}
): Promise<ExecuteResult> {
  const timeout = opts.timeout ?? 30_000;
  const memoryLimit = (opts.memory ?? 50) * 1024 * 1024;

  const QuickJS = await getQuickJS();
  const runtime = QuickJS.newRuntime();

  runtime.setMemoryLimit(memoryLimit);
  runtime.setInterruptHandler(
    shouldInterruptAfterDeadline(Date.now() + timeout)
  );

  const context = runtime.newContext();

  let stdout = "";
  let stderr = "";

  function appendOut(s: string) {
    if (stdout.length < MAX_OUTPUT) stdout += s;
  }
  function appendErr(s: string) {
    if (stderr.length < MAX_OUTPUT) stderr += s;
  }

  // Wire console.log / console.warn / console.error
  const consoleHandle = context.newObject();

  const logFn = context.newFunction("log", (...args) => {
    const parts = args.map((a) => context.dump(a));
    appendOut(parts.map(stringify).join(" ") + "\n");
  });
  context.setProp(consoleHandle, "log", logFn);

  const warnFn = context.newFunction("warn", (...args) => {
    const parts = args.map((a) => context.dump(a));
    appendErr(parts.map(stringify).join(" ") + "\n");
  });
  context.setProp(consoleHandle, "warn", warnFn);

  const errorFn = context.newFunction("error", (...args) => {
    const parts = args.map((a) => context.dump(a));
    appendErr(parts.map(stringify).join(" ") + "\n");
  });
  context.setProp(consoleHandle, "error", errorFn);

  context.setProp(context.global, "console", consoleHandle);

  // Dispose function handles
  logFn.dispose();
  warnFn.dispose();
  errorFn.dispose();
  consoleHandle.dispose();

  // Execute
  const result = context.evalCode(code);

  if (result.error) {
    const err = context.dump(result.error);
    result.error.dispose();
    if (typeof err === "object" && err?.message) {
      appendErr(err.name ? `${err.name}: ${err.message}` : err.message);
    } else {
      appendErr(String(err));
    }
  } else {
    result.value.dispose();
  }

  context.dispose();
  runtime.dispose();

  return { output: stdout, error: stderr };
}

function stringify(val: unknown): string {
  if (typeof val === "string") return val;
  if (val === undefined) return "undefined";
  if (val === null) return "null";
  try {
    return JSON.stringify(val);
  } catch {
    return String(val);
  }
}
