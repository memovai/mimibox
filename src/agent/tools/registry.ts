import type Anthropic from "@anthropic-ai/sdk";
import type { Tool, ToolResult } from "./base.js";

export class ToolRegistry {
  private tools = new Map<string, Tool>();

  register(tool: Tool) {
    this.tools.set(tool.name, tool);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  async execute(name: string, input: Record<string, unknown>): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return { output: "", error: `Unknown tool: ${name}` };
    }
    try {
      return await tool.execute(input);
    } catch (err) {
      return {
        output: "",
        error: `Tool execution error: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  /** Get Anthropic tool definitions, optionally filtered by allowed names */
  getDefinitions(allowedTools?: string[]): Anthropic.Tool[] {
    const tools: Anthropic.Tool[] = [];
    for (const [name, tool] of this.tools) {
      if (allowedTools && !allowedTools.includes(name)) continue;
      tools.push({
        name: tool.name,
        description: tool.description,
        input_schema: tool.inputSchema,
      });
    }
    return tools;
  }
}
