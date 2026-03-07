import type Anthropic from "@anthropic-ai/sdk";

export interface ToolResult {
  output: string;
  error?: string;
  artifacts?: Array<{
    type: "image" | "file";
    name: string;
    mimeType: string;
    data: string; // base64
  }>;
}

export interface Tool {
  name: string;
  description: string;
  inputSchema: Anthropic.Tool["input_schema"];
  execute(input: Record<string, unknown>): Promise<ToolResult>;
}
