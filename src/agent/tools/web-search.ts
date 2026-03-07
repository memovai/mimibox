import type { Tool, ToolResult } from "./base.js";
import { getConfig } from "../../config.js";

export const webSearchTool: Tool = {
  name: "web_search",
  description:
    "Search the web for current information. Returns search results with titles, URLs, and snippets.",
  inputSchema: {
    type: "object" as const,
    properties: {
      query: {
        type: "string",
        description: "Search query",
      },
      count: {
        type: "number",
        description: "Number of results (default 5, max 10)",
      },
    },
    required: ["query"],
  },
  async execute(input): Promise<ToolResult> {
    const query = input.query as string;
    const count = Math.min((input.count as number) || 5, 10);
    const config = getConfig();

    // Try Brave Search first, then Tavily
    if (config.BRAVE_API_KEY) {
      return await braveSearch(query, count, config.BRAVE_API_KEY);
    }
    if (config.TAVILY_API_KEY) {
      return await tavilySearch(query, count, config.TAVILY_API_KEY);
    }

    return {
      output: "",
      error: "No search API key configured. Set BRAVE_API_KEY or TAVILY_API_KEY.",
    };
  },
};

async function braveSearch(query: string, count: number, apiKey: string): Promise<ToolResult> {
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(count));

  const resp = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": apiKey,
    },
  });

  if (!resp.ok) {
    return { output: "", error: `Brave Search API error: ${resp.status}` };
  }

  const data = (await resp.json()) as any;
  const results =
    data.web?.results?.map((r: any) => ({
      title: r.title,
      url: r.url,
      snippet: r.description,
    })) ?? [];

  return {
    output: results
      .map((r: any, i: number) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`)
      .join("\n\n"),
  };
}

async function tavilySearch(query: string, count: number, apiKey: string): Promise<ToolResult> {
  const resp = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      max_results: count,
    }),
  });

  if (!resp.ok) {
    return { output: "", error: `Tavily API error: ${resp.status}` };
  }

  const data = (await resp.json()) as any;
  const results =
    data.results?.map((r: any) => ({
      title: r.title,
      url: r.url,
      snippet: r.content,
    })) ?? [];

  return {
    output: results
      .map((r: any, i: number) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`)
      .join("\n\n"),
  };
}
