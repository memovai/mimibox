import Anthropic from "@anthropic-ai/sdk";
import { getConfig } from "../config.js";
import { ToolRegistry } from "./tools/registry.js";
import type { ToolResult } from "./tools/base.js";

export interface AgentOptions {
  prompt: string;
  model?: string;
  tools?: string[];
  maxIterations?: number;
  timeout?: number;
  sessionMessages?: Anthropic.MessageParam[];
  onEvent?: (event: AgentEvent) => void;
}

export type AgentEvent =
  | { type: "run.started" }
  | { type: "text.delta"; text: string }
  | { type: "tool.start"; toolName: string; toolInput: Record<string, unknown> }
  | { type: "tool.output"; toolName: string; result: ToolResult }
  | {
      type: "artifact";
      artifact: { type: string; name: string; mimeType: string; data: string };
    }
  | {
      type: "run.completed";
      result: AgentResult;
    };

export interface AgentResult {
  text: string;
  artifacts: Array<{
    type: string;
    name: string;
    mimeType: string;
    data: string;
  }>;
  tokensIn: number;
  tokensOut: number;
  iterations: number;
  toolResults: Array<{
    toolName: string;
    input: Record<string, unknown>;
    output: string;
    error?: string;
  }>;
}

const SYSTEM_PROMPT = `You are MimiBox, an AI assistant with code execution capabilities.

When asked to compute, analyze, or demonstrate something:
1. Write and execute code using the available tools
2. Use run_python for data analysis, math, visualization (numpy, pandas, matplotlib available)
3. Use run_javascript for quick calculations, string processing, algorithms
4. Use web_search to find current information

Always execute code to verify your answers rather than just explaining.
Return clear, concise results. If code produces output, include it in your response.`;

export async function runAgent(
  registry: ToolRegistry,
  options: AgentOptions
): Promise<AgentResult> {
  const config = getConfig();
  const client = new Anthropic();

  const model = options.model || config.DEFAULT_MODEL;
  const maxIterations = options.maxIterations || config.MAX_ITERATIONS;
  const emit = options.onEvent || (() => {});

  emit({ type: "run.started" });

  const toolDefs = registry.getDefinitions(options.tools);
  const messages: Anthropic.MessageParam[] = [
    ...(options.sessionMessages || []),
    { role: "user", content: options.prompt },
  ];

  let totalTokensIn = 0;
  let totalTokensOut = 0;
  let iterations = 0;
  const allArtifacts: AgentResult["artifacts"] = [];
  const allToolResults: AgentResult["toolResults"] = [];
  let finalText = "";

  while (iterations < maxIterations) {
    iterations++;

    const response = await client.messages.create({
      model,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools: toolDefs.length > 0 ? toolDefs : undefined,
      messages,
    });

    totalTokensIn += response.usage.input_tokens;
    totalTokensOut += response.usage.output_tokens;

    // Process response content blocks
    const textParts: string[] = [];
    const toolUseBlocks: Anthropic.ContentBlockParam[] = [];
    let hasToolUse = false;

    for (const block of response.content) {
      if (block.type === "text") {
        textParts.push(block.text);
        emit({ type: "text.delta", text: block.text });
      } else if (block.type === "tool_use") {
        hasToolUse = true;
        const toolInput = block.input as Record<string, unknown>;

        emit({ type: "tool.start", toolName: block.name, toolInput });

        // Execute tool
        const result = await registry.execute(block.name, toolInput);

        emit({ type: "tool.output", toolName: block.name, result });

        // Collect artifacts
        if (result.artifacts) {
          for (const artifact of result.artifacts) {
            allArtifacts.push(artifact);
            emit({ type: "artifact", artifact });
          }
        }

        allToolResults.push({
          toolName: block.name,
          input: toolInput,
          output: result.output,
          error: result.error,
        });

        toolUseBlocks.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: result.error
            ? `Error: ${result.error}\n${result.output}`
            : result.output,
        } as any);
      }
    }

    finalText = textParts.join("\n");

    // If no tool use, we're done
    if (!hasToolUse || response.stop_reason === "end_turn") {
      break;
    }

    // Add assistant response and tool results to messages for next iteration
    messages.push({ role: "assistant", content: response.content });
    messages.push({ role: "user", content: toolUseBlocks as any });
  }

  const result: AgentResult = {
    text: finalText,
    artifacts: allArtifacts,
    tokensIn: totalTokensIn,
    tokensOut: totalTokensOut,
    iterations,
    toolResults: allToolResults,
  };

  emit({ type: "run.completed", result });
  return result;
}
