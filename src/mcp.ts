/**
 * actionbridge MCP server. Generic action-runner core: 8 tools.
 *
 * SPECIAL CASE: Zapier's hosted MCP surface is thousands of
 * per-app actions behind a per-user hosted endpoint — per-app
 * action parity is NOT enumerable and is NOT claimed. These 8
 * tools are only the generic runner over the exposed-actions API.
 *
 * Low-level Server API with explicit inputSchema literals (the
 * McpServer+zod path injects $schema/additionalProperties and breaks
 * parity). Zod still validates call args. The literals match the
 * fixture exactly.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { apiBaseFromEnv, callTool, tokenFromEnv, VERSION } from "./zapier.js";
import type { FetchFn } from "./types.js";

const ARG_SCHEMAS: Record<string, z.ZodTypeAny> = {
  list_actions: z.object({}),
  search_actions: z.object({ query: z.string() }),
  get_action: z.object({ action_id: z.string() }),
  execute_action: z.object({ action_id: z.string(), instructions: z.string(), params: z.record(z.string(), z.unknown()).optional() }),
  list_action_apps: z.object({}),
  describe_action_inputs: z.object({ action_id: z.string() }),
  validate_action_params: z.object({ action_id: z.string(), params: z.record(z.string(), z.unknown()) }),
  get_execution_result: z.object({ execution_id: z.string() }),
};

export const TOOLS = [
  {
    name: "list_actions",
    description: "List exposed Zapier actions available to this API key.",
    inputSchema: { type: "object" as const, properties: {}, required: [] as string[] },
  },
  {
    name: "search_actions",
    description: "Search exposed Zapier actions by name, app or description.",
    inputSchema: { type: "object" as const, properties: { query: { type: "string", description: "Search text matched against the name, app, and description of exposed actions." } }, required: ["query"] },
  },
  {
    name: "get_action",
    description: "Retrieve a single exposed Zapier action by ID.",
    inputSchema: { type: "object" as const, properties: { action_id: { type: "string", description: "ID of the exposed Zapier action to retrieve." } }, required: ["action_id"] },
  },
  {
    name: "execute_action",
    description: "Execute an exposed Zapier action with instructions and optional params.",
    inputSchema: { type: "object" as const, properties: { action_id: { type: "string", description: "ID of the exposed Zapier action to execute." }, instructions: { type: "string", description: "Instructions describing how the action should be performed, passed to the Zapier execution endpoint." }, params: { type: "object", description: "Optional parameter values for the action, as a key-value object, sent with the execution request." } }, required: ["action_id", "instructions"] },
  },
  {
    name: "list_action_apps",
    description: "List distinct app names across exposed Zapier actions.",
    inputSchema: { type: "object" as const, properties: {}, required: [] as string[] },
  },
  {
    name: "describe_action_inputs",
    description: "Describe the input parameters for an exposed Zapier action.",
    inputSchema: { type: "object" as const, properties: { action_id: { type: "string", description: "ID of the exposed Zapier action whose declared input parameters should be described." } }, required: ["action_id"] },
  },
  {
    name: "validate_action_params",
    description: "Validate params against an exposed Zapier action's declared parameters.",
    inputSchema: { type: "object" as const, properties: { action_id: { type: "string", description: "ID of the exposed Zapier action to validate the given params against." }, params: { type: "object", description: "Parameter values to check against the action's declared parameters, as a key-value object." } }, required: ["action_id", "params"] },
  },
  {
    name: "get_execution_result",
    description: "Retrieve the result of a Zapier action execution by execution ID.",
    inputSchema: { type: "object" as const, properties: { execution_id: { type: "string", description: "ID of the action execution whose result should be retrieved." } }, required: ["execution_id"] },
  },
];

function textResult(value: unknown) {
  return { content: [{ type: "text" as const, text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }] };
}
function errorResult(err: unknown) {
  return { content: [{ type: "text" as const, text: err instanceof Error ? err.message : String(err) }], isError: true };
}

const server = new Server({ name: "actionbridge", version: VERSION }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const schema = ARG_SCHEMAS[name];
  if (!schema) throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
  try {
    const token = tokenFromEnv();
    const parsed = schema.parse(args ?? {}) as Record<string, unknown>;
    const fetchFn = globalThis.fetch as unknown as FetchFn;
    return textResult(await callTool(fetchFn, token, apiBaseFromEnv(), name, parsed));
  } catch (err) {
    return errorResult(err);
  }
});

async function main(): Promise<void> {
  await server.connect(new StdioServerTransport());
}
void main();
