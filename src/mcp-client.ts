import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import {
  ListToolsResultSchema,
  CallToolResultSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type {
  Tool,
  ToolDefinition,
  ToolExecuteResult,
  ToolParameter,
  ToolRegistry,
} from "./tools/tool-registry.js";

// ── Config types ────────────────────────────────────────────────────

interface StdioServerConfig {
  type?: "stdio";
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

interface SseServerConfig {
  type: "sse";
  url: string;
  headers?: Record<string, string>;
}

interface StreamableHttpServerConfig {
  type: "streamable-http";
  url: string;
  headers?: Record<string, string>;
}

type McpServerConfig =
  | StdioServerConfig
  | SseServerConfig
  | StreamableHttpServerConfig;

interface McpConfig {
  mcpServers: Record<string, McpServerConfig>;
}

// ── Config loader ───────────────────────────────────────────────────

async function loadMcpConfig(
  configPath = resolve(process.cwd(), ".mcp.json")
): Promise<McpConfig> {
  const raw = await readFile(configPath, "utf-8");
  return JSON.parse(raw) as McpConfig;
}

// ── Transport factory ───────────────────────────────────────────────

function createTransport(config: McpServerConfig): Transport {
  const type = config.type ?? "stdio";

  switch (type) {
    case "stdio": {
      const c = config as StdioServerConfig;
      return new StdioClientTransport({
        command: c.command,
        args: c.args,
        env: c.env
          ? { ...process.env, ...c.env } as Record<string, string>
          : undefined,
      });
    }
    case "sse": {
      const c = config as SseServerConfig;
      return new SSEClientTransport(new URL(c.url), {
        requestInit: c.headers
          ? { headers: c.headers }
          : undefined,
      });
    }
    case "streamable-http": {
      const c = config as StreamableHttpServerConfig;
      return new StreamableHTTPClientTransport(new URL(c.url), {
        requestInit: c.headers
          ? { headers: c.headers }
          : undefined,
      });
    }
    default:
      throw new Error(`Unknown MCP transport type: "${type}"`);
  }
}

// ── JSON Schema → Gemini-compatible conversion ─────────────────────

interface JsonSchema {
  type?: string | string[];
  description?: string;
  enum?: string[];
  items?: JsonSchema;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  [key: string]: unknown;
}

function resolveType(type: string | string[] | undefined): string {
  if (Array.isArray(type)) {
    const nonNull = type.filter((t) => t !== "null");
    return nonNull[0] ?? "string";
  }
  return type ?? "string";
}

function convertToGeminiSchema(schema: JsonSchema): ToolParameter {
  // Handle anyOf / oneOf: pick first non-null variant
  const variants = schema.anyOf ?? schema.oneOf;
  if (variants && variants.length > 0) {
    const nonNull = variants.filter(
      (v) => !(v.type === "null" || (Array.isArray(v.type) && v.type.length === 1 && v.type[0] === "null"))
    );
    const picked = nonNull[0] ?? variants[0];
    return convertToGeminiSchema({ description: schema.description, ...picked });
  }

  const type = resolveType(schema.type);
  const result: ToolParameter = {
    type,
    description: schema.description ?? "",
  };

  if (schema.enum) {
    result.enum = schema.enum;
  }

  if (schema.properties) {
    const props: Record<string, ToolParameter> = {};
    for (const [key, value] of Object.entries(schema.properties)) {
      props[key] = convertToGeminiSchema(value);
    }
    result.properties = props;
  }

  if (schema.required) {
    result.required = schema.required;
  }

  if (type === "array" && schema.items) {
    result.items = convertToGeminiSchema(schema.items);
  }

  return result;
}

// ── McpTool adapter ─────────────────────────────────────────────────

interface McpToolSchema {
  name: string;
  description?: string;
  inputSchema?: JsonSchema;
}

class McpTool implements Tool {
  definition: ToolDefinition;

  constructor(
    private serverName: string,
    private client: Client,
    private schema: McpToolSchema
  ) {
    const properties = schema.inputSchema?.properties ?? {};
    const parameters: ToolDefinition["parameters"] = {
      type: "object",
      properties: {},
      required: schema.inputSchema?.required,
    };

    for (const [key, prop] of Object.entries(properties)) {
      parameters.properties[key] = convertToGeminiSchema(prop);
    }

    this.definition = {
      name: `${this.serverName}-${schema.name}`,
      description: schema.description ?? "",
      parameters,
    };
  }

  displayArgs(params: Record<string, unknown>): string {
    return Object.entries(params)
      .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)
      .join(", ");
  }

  async execute(params: Record<string, unknown>): Promise<ToolExecuteResult> {
    const result = await this.client.request(
      { method: "tools/call" as const, params: { name: this.schema.name, arguments: params } },
      CallToolResultSchema
    );

    const textParts = result.content
      .filter((c): c is { type: "text"; text: string } => c.type === "text")
      .map((c) => c.text);

    const text = textParts.join("\n");

    return {
      data: { result: text, isError: result.isError ?? false },
      displayText: `[MCP:${this.schema.name}] done`,
    };
  }
}

// ── McpClientManager ────────────────────────────────────────────────

interface ConnectedServer {
  name: string;
  client: Client;
  transport: Transport;
  tools: McpTool[];
}

export class McpClientManager {
  private servers: ConnectedServer[] = [];

  /** Read .mcp.json and connect to every configured server. */
  async connect(configPath?: string): Promise<void> {
    let config: McpConfig;
    try {
      config = await loadMcpConfig(configPath);
    } catch (err) {
      // No config file or parse error — just skip silently
      console.log("No .mcp.json found or failed to parse, skipping MCP setup.");
      return;
    }

    for (const [serverName, serverConfig] of Object.entries(
      config.mcpServers
    )) {
      try {
        const type = serverConfig.type ?? "stdio";
        console.log(`Connecting to MCP server "${serverName}" (${type})...`);

        const transport = createTransport(serverConfig);

        const client = new Client({
          name: "try-agent",
          version: "1.0.0",
        });

        await client.connect(transport);

        const { tools: toolSchemas } = await client.request(
          { method: "tools/list" as const, params: {} },
          ListToolsResultSchema
        );

        const tools = toolSchemas.map(
          (schema) => new McpTool(serverName, client, schema as McpToolSchema)
        );

        this.servers.push({
          name: serverName,
          client,
          transport,
          tools,
        });

        console.log(
          `  ✓ "${serverName}" connected — ${tools.length} tool(s): ${tools.map((t) => t.definition.name).join(", ")}`
        );
      } catch (err) {
        console.error(
          `  ✗ Failed to connect to "${serverName}":`,
          err instanceof Error ? err.message : err
        );
      }
    }
  }

  /** Register all MCP tools into the given ToolRegistry. */
  registerTools(registry: ToolRegistry): void {
    for (const server of this.servers) {
      for (const tool of server.tools) {
        try {
          registry.register(tool);
        } catch (err) {
          console.error(
            `  Skipped registering "${tool.definition.name}":`,
            err instanceof Error ? err.message : err
          );
        }
      }
    }
  }

  /** Close all server connections. */
  async close(): Promise<void> {
    for (const server of this.servers) {
      try {
        await server.client.close();
      } catch {
        // ignore close errors
      }
    }
    this.servers = [];
  }
}
