import type { Tool, ToolResult } from "./base.js";
import { executeJavaScript } from "../../sandbox/quickjs-pool.js";

export const runJavaScriptTool: Tool = {
  name: "run_javascript",
  description:
    "Execute JavaScript code in a sandboxed QuickJS environment. " +
    "Supports ES2020 syntax. console.log() output is captured. " +
    "No network access or filesystem. Good for calculations, data processing, string manipulation.",
  inputSchema: {
    type: "object" as const,
    properties: {
      code: {
        type: "string",
        description: "JavaScript code to execute",
      },
    },
    required: ["code"],
  },
  async execute(input): Promise<ToolResult> {
    const code = input.code as string;
    const result = await executeJavaScript(code);
    return {
      output: result.output,
      error: result.error,
    };
  },
};
