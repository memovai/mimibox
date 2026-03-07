import type { Tool, ToolResult } from "./base.js";
import { executePython } from "../../sandbox/pyodide-pool.js";

export const runPythonTool: Tool = {
  name: "run_python",
  description:
    "Execute Python code in a sandboxed Pyodide (Python 3.11 WASM) environment. " +
    "Supports numpy, pandas, matplotlib, and other pure-Python packages. " +
    "print() output is captured. matplotlib plots are returned as base64 PNG images. " +
    "No network access or filesystem. Good for math, data analysis, visualization.",
  inputSchema: {
    type: "object" as const,
    properties: {
      code: {
        type: "string",
        description: "Python code to execute",
      },
    },
    required: ["code"],
  },
  async execute(input): Promise<ToolResult> {
    const code = input.code as string;
    const result = await executePython(code);
    return {
      output: result.output,
      error: result.error,
      artifacts: result.artifacts,
    };
  },
};
