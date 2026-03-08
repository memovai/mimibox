import { loadPyodide, type PyodideInterface } from "pyodide";

export interface ExecuteOptions {
  timeout?: number;
}

export interface ExecuteResult {
  output: string;
  error: string;
}

const MAX_OUTPUT = 1024 * 1024; // 1MB

let pyodideInstance: PyodideInterface | null = null;

async function getPyodide(): Promise<PyodideInterface> {
  if (pyodideInstance) return pyodideInstance;
  pyodideInstance = await loadPyodide({
    jsglobals: Object.create(null), // block sandbox escape
  });
  return pyodideInstance;
}

export async function executePython(
  code: string,
  opts: ExecuteOptions = {}
): Promise<ExecuteResult> {
  const timeout = opts.timeout ?? 30_000;
  const pyodide = await getPyodide();

  let stdout = "";
  let stderr = "";

  pyodide.setStdout({
    batched: (msg: string) => {
      if (stdout.length < MAX_OUTPUT) stdout += msg + "\n";
    },
  });

  pyodide.setStderr({
    batched: (msg: string) => {
      if (stderr.length < MAX_OUTPUT) stderr += msg + "\n";
    },
  });

  try {
    await Promise.race([
      pyodide.runPythonAsync(code),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Execution timed out")), timeout)
      ),
    ]);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    stderr += message + "\n";
  }

  return { output: stdout, error: stderr };
}
