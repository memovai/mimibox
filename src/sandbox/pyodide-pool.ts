import { loadPyodide, type PyodideInterface } from "pyodide";

interface PooledInstance {
  pyodide: PyodideInterface;
  useCount: number;
}

const MAX_USES = 100;
const POOL_SIZE = 2;

let pool: PooledInstance[] = [];
let initializing = false;
let initPromise: Promise<void> | null = null;

async function createInstance(): Promise<PooledInstance> {
  const pyodide = await loadPyodide({
    // stdout/stderr will be captured per-execution
  });
  // Pre-load commonly used packages
  await pyodide.loadPackage(["micropip"]);
  return { pyodide, useCount: 0 };
}

export async function initPyodidePool(): Promise<void> {
  if (initPromise) return initPromise;
  if (pool.length >= POOL_SIZE) return;

  initializing = true;
  initPromise = (async () => {
    console.log("Warming up Pyodide pool...");
    const start = Date.now();
    // Create instances sequentially to avoid memory spikes
    for (let i = pool.length; i < POOL_SIZE; i++) {
      pool.push(await createInstance());
    }
    console.log(`Pyodide pool ready (${POOL_SIZE} instances, ${Date.now() - start}ms)`);
    initializing = false;
  })();

  return initPromise;
}

async function acquireInstance(): Promise<PooledInstance> {
  if (pool.length === 0) {
    await initPyodidePool();
  }

  // Find least-used instance
  let best = pool[0]!;
  for (const inst of pool) {
    if (inst.useCount < best.useCount) best = inst;
  }

  best.useCount++;

  // If instance is worn out, schedule replacement
  if (best.useCount >= MAX_USES) {
    const idx = pool.indexOf(best);
    // Replace asynchronously
    createInstance().then((newInst) => {
      pool[idx] = newInst;
    });
  }

  return best;
}

export interface PyExecResult {
  output: string;
  error?: string;
  durationMs: number;
  artifacts?: Array<{
    type: "image" | "file";
    name: string;
    mimeType: string;
    data: string;
  }>;
}

export async function executePython(
  code: string,
  timeoutMs: number = 30_000
): Promise<PyExecResult> {
  const instance = await acquireInstance();
  const { pyodide } = instance;

  const stdout: string[] = [];
  const stderr: string[] = [];

  pyodide.setStdout({ batched: (line) => stdout.push(line) });
  pyodide.setStderr({ batched: (line) => stderr.push(line) });

  const start = Date.now();

  // Wrap execution with timeout
  const execPromise = (async () => {
    try {
      // Run the code
      const result = await pyodide.runPythonAsync(code);

      let output = stdout.join("\n");
      if (result !== undefined && result !== null && String(result) !== "None") {
        if (output) output += "\n";
        output += String(result);
      }

      if (!output && stderr.length === 0) {
        output = "(no output)";
      }

      const artifacts: PyExecResult["artifacts"] = [];

      // Check if matplotlib figure was created
      try {
        const hasPlot = pyodide.runPython(`
import sys
has_plt = 'matplotlib.pyplot' in sys.modules
if has_plt:
    import matplotlib.pyplot as plt
    figs = plt.get_fignums()
    has_plt = len(figs) > 0
has_plt
`);
        if (hasPlot) {
          const imgData = pyodide.runPython(`
import matplotlib.pyplot as plt
import io, base64
buf = io.BytesIO()
plt.savefig(buf, format='png', dpi=100, bbox_inches='tight')
plt.close('all')
buf.seek(0)
base64.b64encode(buf.read()).decode('utf-8')
`);
          artifacts.push({
            type: "image",
            name: "plot.png",
            mimeType: "image/png",
            data: String(imgData),
          });
        }
      } catch {
        // No matplotlib, skip
      }

      return { output, artifacts, error: undefined };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const output = stdout.join("\n");
      return { output, error: errMsg, artifacts: [] };
    }
  })();

  const timeoutPromise = new Promise<{ output: string; error: string; artifacts: never[] }>(
    (resolve) => {
      setTimeout(() => {
        resolve({
          output: stdout.join("\n"),
          error: `Execution timed out after ${timeoutMs}ms`,
          artifacts: [],
        });
      }, timeoutMs);
    }
  );

  const result = await Promise.race([execPromise, timeoutPromise]);
  const durationMs = Date.now() - start;

  let output = result.output;
  if (stderr.length > 0) {
    if (output) output += "\n";
    output += "STDERR: " + stderr.join("\n");
  }

  // Truncate
  if (output.length > 1_000_000) {
    output = output.slice(0, 1_000_000) + "\n...(truncated)";
  }

  return {
    output,
    error: result.error,
    durationMs,
    artifacts: result.artifacts,
  };
}
