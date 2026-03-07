import { getQuickJS, type QuickJSWASMModule } from "quickjs-emscripten";

let quickjsModule: QuickJSWASMModule | null = null;

async function getModule(): Promise<QuickJSWASMModule> {
  if (!quickjsModule) {
    quickjsModule = await getQuickJS();
  }
  return quickjsModule;
}

export interface JSExecResult {
  output: string;
  error?: string;
  durationMs: number;
}

export async function executeJavaScript(
  code: string,
  timeoutMs: number = 30_000
): Promise<JSExecResult> {
  const mod = await getModule();
  const runtime = mod.newRuntime();
  runtime.setMemoryLimit(50 * 1024 * 1024); // 50MB
  runtime.setMaxStackSize(1024 * 1024); // 1MB stack

  // Set up interrupt for timeout
  const deadline = Date.now() + timeoutMs;
  runtime.setInterruptHandler(() => Date.now() > deadline);

  const vm = runtime.newContext();
  const logs: string[] = [];

  // Inject console.log
  const consoleObj = vm.newObject();
  const logFn = vm.newFunction("log", (...args) => {
    const parts = args.map((arg) => {
      const str = vm.getString(arg);
      return str;
    });
    logs.push(parts.join(" "));
  });
  vm.setProp(consoleObj, "log", logFn);
  vm.setProp(consoleObj, "warn", logFn);
  vm.setProp(consoleObj, "error", logFn);
  vm.setProp(vm.global, "console", consoleObj);
  logFn.dispose();
  consoleObj.dispose();

  const start = Date.now();
  const result = vm.evalCode(code, "script.js");

  let output = "";
  let error: string | undefined;

  if (result.error) {
    const errObj = vm.dump(result.error);
    error = typeof errObj === "object" ? errObj.message || JSON.stringify(errObj) : String(errObj);
    result.error.dispose();
  } else {
    const val = vm.dump(result.value);
    result.value.dispose();
    // Combine console output + return value
    if (logs.length > 0) {
      output = logs.join("\n");
    }
    if (val !== undefined && val !== null) {
      const valStr = typeof val === "object" ? JSON.stringify(val, null, 2) : String(val);
      if (output) {
        output += "\n" + valStr;
      } else {
        output = valStr;
      }
    }
  }

  if (!output && !error) {
    output = "(no output)";
  }

  const durationMs = Date.now() - start;
  vm.dispose();
  runtime.dispose();

  // Truncate output to 1MB
  if (output.length > 1_000_000) {
    output = output.slice(0, 1_000_000) + "\n...(truncated)";
  }

  return { output, error, durationMs };
}
