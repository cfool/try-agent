export interface ToolParameter {
  type: string;
  description: string;
  enum?: string[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, ToolParameter>;
    required?: string[];
  };
}

export interface Tool {
  definition: ToolDefinition;
  execute(params: Record<string, unknown>): Promise<unknown>;
}

export interface ToolResult {
  toolName: string;
  result?: unknown;
  error?: string;
}

export class ToolRegistry {
  private tools = new Map<string, Tool>();

  register(tool: Tool): void {
    if (this.tools.has(tool.definition.name)) {
      throw new Error(`Tool "${tool.definition.name}" is already registered`);
    }
    this.tools.set(tool.definition.name, tool);
  }

  unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  list(): ToolDefinition[] {
    return Array.from(this.tools.values()).map((t) => t.definition);
  }

  async execute(
    name: string,
    params: Record<string, unknown>
  ): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return { toolName: name, error: `Tool "${name}" not found` };
    }

    try {
      const result = await tool.execute(params);
      return { toolName: name, result };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { toolName: name, error: message };
    }
  }
}
